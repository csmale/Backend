const utils = require('./utils');

// const pgp = require('pg-promise')(/* options */)
// const db = pgp('postgres://gatemaster:ZH9DxkMhSkNzMRU@192.168.0.7:5432/gatemaster');

const Pool = require('pg').Pool
const pool = new Pool({
  user: 'gatemaster',
  host: '192.168.0.7',
  database: 'gatemaster',
  password: 'ZH9DxkMhSkNzMRU',
  port: 5432,
})

const MAX_PW_ATTEMPTS = 3;

const { randomUUID } = require('crypto'); // Added in: node v14.17.0

// '89rct5ac2-8493-49b0-95d8-de843d90e6ca'

function newID() {
  return randomUUID();
}

async function txnStart() {
  var client = await pool.connect();
  client.query('BEGIN');
  return client;
}

async function txnCommit(client) {
  await client.query('COMMIT');
  client.release();
}

async function txnRollback(client) {
  await client.query('ROLLBACK');
  client.release();
}

/**
 * Perform a database operation that will return a single row
 * @param {string} q SQL query
 * @param {string[]} params Parameters to be inserted in the query
 * @returns {object} The row is returned as an object
 */
async function getSingle(q, params, client) {
  var res;

  try {
    if (client) {
      res = await client.query(q, params);
    } else {
      res = await pool.query(q, params);
    }
  } catch (error) {
    console.log(`Error from DB: ${error}`);
    console.log(`Query: ${q}`);
    console.log(`Params: ${JSON.stringify(params)}`);
    throw error;
  }
  // console.log(JSON.stringify(res));
  return res.rows[0];
}

/**
 * Perform a database operation that will return multiple rows
 * @param {string} q SQL query
 * @param {string[]} params Parameters to be inserted in the query
 * @returns {object[]} Each row is returned as an object
 */
async function getMulti(q, params, client) {
  var res;
  try {
    if (client) {
      res = await client.query(q.params);
    } else {
      res = await pool.query(q, params);
    }
  } catch (error) {
    console.log(`Error from DB: ${error}`);
    console.log(`Query: ${q}`);
    console.log(`Params: ${JSON.stringify(params)}`);
    throw error;
  }
  // console.log(JSON.stringify(res));
  return res.rows;
}

async function getUserById(id) {
  console.log(`looking for user id = ${id}`);
  return await getSingle('SELECT * FROM users WHERE id = $1', [id]);
}

async function getUserByEmail(email) {
  console.log(`looking for user by email = ${email}`);
  return await getSingle('SELECT * FROM users WHERE email = $1', [email]);
}

/**
 * Performs a credential check
 * @param {string} user 
 * @param {string} password 
 * @returns User profile if succesful, otherwise an error object
 */
async function checkCredentials(user, password) {
  console.log(`checking credentials for user ${user}`);
  const client = await txnStart();

  let lowerUser = user.toLowerCase();
  let res = await getSingle('SELECT *, (pwhash = crypt($2, pwhash)) AS password_match FROM users WHERE username = $1', [lowerUser, password], client);
  // console.log(`check: ${JSON.stringify(res)}`);
  if (!res || !res.password_match) {
    let res2 = await getSingle('UPDATE users SET bad_pw_count=bad_pw_count+1, is_locked=(is_locked OR bad_pw_count>$2) WHERE username = $1 RETURNING bad_pw_count, is_locked', [lowerUser, MAX_PW_ATTEMPTS], client);
    if (res2) {
      console.log(`user ${lowerUser} ${res2.bad_pw_count} attempts, account is ${res2.is_locked ? 'LOCKED' : 'NOT LOCKED'}`);
    }
    txnCommit(client);
    return { error: 'Incorrect user name or password' };
  } else {
    if (res.is_locked) {
      txnCommit(client);
      return { error: 'Account is locked' };
    }
    let res2 = await getSingle('UPDATE users SET bad_pw_count=0 WHERE username = $1 RETURNING *', [lowerUser], client);
    res.bad_pw_count = 0;
  }
  if (res.pwhash) delete res.pwhash;
  if (res.password_match) delete res.password_match;
  txnCommit(client);
  return res;
}

async function createSession(user_id, device) {
  console.log(`creating session for user ${user_id} on device ${device}`);
  const session_id = utils.generate_key();

  let res = await getSingle('INSERT INTO sessions (session_id, user_id, device, created, lastuse) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING session_id', [session_id, user_id, device]);
  return res;
}

/**
 * Resume session by ID
 * @param {string} session_id Session ID
 * @param {string} device Device identifier
 * @returns 
 */
async function resumeSession(session_id, device) {
  console.log(`resuming session ${session_id}`);

  const client = await txnStart();

  let res = await getSingle('UPDATE sessions SET lastuse=NOW() WHERE session_id = $1 AND device = $2 RETURNING user_id', [session_id, device], client);
  if (res) {
    res = await getSingle('SELECT * FROM users WHERE id = $1', [res.user_id], client);
    if (res?.pwhash) delete res.pwhash;
    if (res?.password_match) delete res.password_match;
    txnCommit(client);
  } else {
    txnRollback(client);
  }
  return res;
}

/**
 * Delete session by ID: log off user
 * @param {string} session_id Session ID
 * @param {string} device Device identifier
 * @returns 
 */
async function deleteSession(session_id, device) {
  console.log(`deleting session ${session_id} on device ${device}`);
  let res = await getSingle('DELETE FROM sessions WHERE session_id = $1 AND device = $2 RETURNING user_id', [session_id, device]);
  console.log(`delete session returned ${JSON.stringify(res)}`);
  return res;
}

/**
 * Update user profile by ID
 * @param {object} params Must include company, email, displayname, distance_units
 * @returns 
 */
async function updateUserById(params) {
  console.log(`updating profile for user ${params.userid}`);
  let lowerUser = params.id.toLowerCase();
  const client = await txnStart();

  let current = await getSingle('SELECT * FROM users WHERE id=$1 FOR UPDATE', [lowerUser], client);
  if (!current) {
    txnRollback(client);
    return { error: 'Unable to get user profile;' };
  }
  console.log(`current profile: ${JSON.stringify(current)}`);
  console.log(`changed profile: ${JSON.stringify(params)}`);

  let company = params.company;
  let email = params.email;
  // if email is not changing, don't trigger the email change process
  if (current.email == email) {
    email = '';
  } else if (!utils.isValidEmail(email)) {
    txnRollback(client);
    return { error: `Improperly formed email ${email}` };
  }
  let displayname = params.displayname;
  let distance_units = params.distance_units;
  if (!(['km', 'mi'].includes(distance_units))) {
    txnRollback(client);
    return { error: 'Bad value for distance units' };
  }

  // UPDATE users SET company=$2, email=$3, displayname=$4, distance_units=$5 WHERE id = $1
  let res = await getSingle('UPDATE users SET company=$2, new_email=$3, displayname=$4, distance_units=$5 WHERE id = $1 RETURNING *', [lowerUser, company, email, displayname, distance_units], client);
  // console.log(`check: ${JSON.stringify(res)}`);
  if (!res) {
    txnRollback(client);
    return { error: 'Unable to update profile' };
  }
  txnCommit(client);
  delete res.pwhash;
  delete res.password_match;
  return res;
};

/**
 * Change a user's password and unlock the account
 * @param {string} id The user id
 * @param {string} oldpassword The current password
 * @param {string} newpassword The new password
 * @returns User profile if succesful, otherwise an error object
 */
async function changePassword(id, oldpassword, newpassword) {
  console.log(`changing password for user ${id}`);
  let lowerUser = id.toLowerCase();
  let res = await getSingle("UPDATE users SET is_locked=FALSE, bad_pw_count=0, pwhash=crypt($3, gen_salt('md5')) WHERE pwhash = crypt($2, pwhash) AND id = $1 RETURNING *", [lowerUser, oldpassword, newpassword]);
  // console.log(`check: ${JSON.stringify(res)}`);
  if (!res) {
    return { error: 'Incorrect user name or password' };
  }
  delete res.pwhash;
  return res;
}

/**
 * Change a user's password and unlock the account
 * @param {string} id The user id
 * @param {string} newpassword The new password
 * @returns User profile if succesful, otherwise an error object
 */
async function setPassword(id, newpassword) {
  console.log(`setting password for user ${id}`);
  let lowerUser = id.toLowerCase();
  let res = await getSingle("UPDATE users SET is_locked=FALSE, bad_pw_count=0, pwhash=crypt($3, gen_salt('md5') WHERE id = $1 RETURNING *", [lowerUser, newpassword]);
  // console.log(`check: ${JSON.stringify(res)}`);
  if (!res) {
    return { error: 'Unable to set password' };
  }
  delete res.pwhash;
  return res;
}

async function getDestById(id) {
  console.log(`getting destination details for ${id}`);
  let res = await getSingle('SELECT *, ST_Y(loc::geometry) AS lat, ST_X(loc::geometry) AS lon FROM dests WHERE id = $1', [id]);
  return res;
}

async function getNearbyDests(lat, lon, dist) {
  console.log(`getting nearby destinations for (${lat},${lon},${dist})`);
  let res = await getMulti(`SELECT *, ST_Y(loc::geometry) AS lat, ST_X(loc::geometry) AS lon, ST_Distance(loc, ST_SetSRID(ST_MakePoint(${lon}, ${lat}),4326)) AS dist FROM dests WHERE ST_DWithin(loc, ST_SetSRID(ST_MakePoint(${lon}, ${lat}),4326), ${dist}) ORDER BY dist LIMIT 20`);
  return res;
}

async function getPostcodeLocation(postcode) {
  var pc = postcode.toUpperCase().replace(' ', '');
  var lon = 0.0;
  var lat = 0.0;

  var pcregexp = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/
  var pcregexp2 = /^([A-Z]{1,2}\d[A-Z\d]?)$/
  var matches = pc.match(pcregexp);
  if (matches && matches.length == 3) {
    pc = `${matches[1]} ${matches[2]}`;
  } else {
    matches = pc.match(pcregexp2);
    if (matches && matches.length == 2) {
      pc = matches[1];
    } else {
      console.log(`postcode looks malformed: ${postcode}`);
      return null;
    }
  }
  console.log(`getting location for postcode ${pc}`);
  let res = await getSingle(`SELECT latitude, longitude FROM postcodes WHERE postcode = $1`, [pc]);
  if (res) {
    lon = res.longitude;
    lat = res.latitude;
  } else {
    console.log(`no postcode data for ${pc}`);
    return null;
  }
  console.log(`postcode ${postcode} location (${lat}, ${lon})`);
  return { lon: lon, lat: lat }
}

async function searchDests(opts) {
  console.log(`destinations for ${JSON.stringify(opts)}`);
  /*
   *  expecting an object with one or more of the following fields:
   *  company - name of company
   *  postcode - postcode (preferably complete)
   *  site - name of site
   *  unit - unit within site
   *  each field is used as a pattern in a LIKE clause
  */
  var distcol = '';

  var awhere = [];
  if (opts.company) {
    if (opts.company.length < 3) {
      return { error: "Company must have at least 3 characters" };
    }
    awhere.push(`company ILIKE '%${opts.company}%'`);
  }
  if (opts.site) {
    if (opts.site.length < 3) {
      return { error: "Site must have at least 3 characters" };
    }
    awhere.push(`site ILIKE '%${opts.site}%'`);
  }
  if (opts.unit) {
    if (opts.unit.length < 3) {
      return { error: "Unit must have at least 3 characters" };
    }
    awhere.push(`unit ILIKE '%${opts.unit}%'`);
  }
  if (opts.postcode) {
    if (opts.postcode.length < 3) {
      return { error: "Postcode must have at least 3 characters" };
    }
    var pcdata = await getPostcodeLocation(opts.postcode);
    if (pcdata) {
      opts.lat = pcdata.lat;
      opts.lon = pcdata.lon;
      // will force the distance-based selection below
    } else {
      awhere.push(`postcode ILIKE '${opts.postcode}%'`);
    }
  }
  if (awhere.length == 0 && !opts.lat && !opts.lon) {
    return { error: "No criteria specified" };
  }

  if (opts.lat && opts.lon) {
    var lat = parseFloat(opts.lat);
    var lon = parseFloat(opts.lon);
    var dist;
    if (opts.dist) {
      dist = parseFloat(opts.dist);
    } else {
      dist = 5000.0;
    }
    if (isNaN(lat) || isNaN(lon) || isNaN(dist)) {
      return { error: "Search location or distance not properly specified" };
    }
    awhere.push(`ST_DWithin(loc, ST_SetSRID(ST_MakePoint(${lon}, ${lat}),4326), ${dist})`);
  }

  var where = awhere.join(' AND ');

  var sql;
  if (dist) {
    sql = `SELECT *, ST_Y(loc::geometry) AS lat, ST_X(loc::geometry) AS lon, ST_Distance(loc, ST_SetSRID(ST_MakePoint(${lon}, ${lat}),4326)) AS dist FROM dests WHERE ${where} ORDER BY dist ASC LIMIT 20`;
  } else {
    sql = `SELECT *, ST_Y(loc::geometry) AS lat, ST_X(loc::geometry) AS lon FROM dests WHERE ${where} LIMIT 20`;
  }

  let res = await getMulti(sql);
  return res;
}

/**
 * insert new user record, unlocked, validation_sent=now(), email_validated=false, nonce=gen_uuid()
 * @param {object} params 
 * @returns User profile if succesful, otherwise an error object
 */
async function doRegister(params) {
  console.log(`registering (${params.email},${params.displayname})`);
  if (params.email == '') {
    return { error: 'Email address is required' };
  }
  if (!utils.isValidEmail(params.email)) {
    return { error: 'Improperly formed email' };
  }
  if (!params.userid || params.userid == '') {
    return { error: 'Missing User ID' };
  }
  let res = await getSingle(`INSERT INTO users (userid, username, displayname, email, company) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [params.userid, params.username, params.displayname, params.email, params.company]);
  console.log(`insert returns ${JSON.stringify(res)}`);
  return res;
}

async function doResend(params) {
  console.log(`recording resend for (${params.email})`);
  // update users set verification_sent=now, where userid=params.userid and email_verified=false
  let res = await getSingle(`UPDATE users SET email_validated=DEFAULT, validation_sent=DEFAULT, validation_nonce=DEFAULT WHERE id=$1 RETURNING *`, [id]);
  return res;
}

// check account email_validated=false
// check validation_sent has not expired (2 days?)
// update validation_sent=null, email_validated=true
async function doActivate(id, x) {
  console.log(`attempting to activate account (${id})`);
  // update users set email_verified=true, validation_sent=null, verification_nonce=null
  // where userid=params.userid
  // and verification_nonce=params.verification_nonce
  // and (now()-validation_sent) < 48h
  let res = await getSingle(`UPDATE users SET email_validated=TRUE, validation_sent=NULL, validation_nonce=NULL WHERE id=$1 AND validation_nonce=$2 RETURNING *`, [id, x]);
  if (!res) {
    return { error: 'Unable to activate account. Perhaps it is already active?' };
  }
  if (res.pwhash) delete res.pwhash;
  return res;
}

/**
 * add new destination, including optional photo
 * @param {Object} dest 
 * 
 * company
 * site
 * unit
 * postcode
 * userid
 * image
 *  data
 *  description
 *  caption
 *  latitude
 *  longitude
 * 
 */
async function doAddDest(dest, image) {
  console.log(`add destination: ${JSON.stringify(dest)}`);
  if (image) {
    console.log(`image: ${JSON.stringify(image)}`);
  }
  const client = await txnStart();
  var image_id;

  if (image) {
    var res = getSingle(`INSERT INTO images (data, uploaded_by, uploaded_on, description, caption, latitude, longitude, location)
    VALUES ($1, $2, NOW(), $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($5, $6), 4326))
    RETURNING id`,
      [image.data, dest.userid, image.description, image.caption, image.lon, image.lat], client);
    if (!res) {
      txnRollback(client);
      return { error: 'Unable to store new image' };
    }
    if (res.error) {
      txnRollback(client);
      return res;
    }
    image_id = res.id;
  }

  res = getSingle(`INSERT INTO dests (company, postcode, unit, site, loc, notes)
  VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)
  RETURNING *`, [dest.company, dest.postcode, dest.unit, dest.site, dest.lon, dest.lat, dest.notes], client);
  if (!res) {
    txnRollback(client);
    return { error: 'Unable to store new destination' };
  }
  if (res.error) {
    txnRollback(client);
    return res;
  }

  if (image) {
    var link = getSingle(`INSERT INTO destimages(image_id, dest_id, role)
  VALUES ($1, $2, $3)
  RETURNING *`, [image_id, res.id, image.role], client);
    if (!link) {
      txnRollback(client);
      return { error: 'Unable to link image to new destination' };
    }
    if (link.error) {
      txnRollback(client);
      return link;
    }
  }
  txnCommit(client);
  return res;
  // need to put all this in a transaction

}

/**
 * add new destination, including optional photo
 * @param {Object} dest 
 * 
 * company
 * site
 * unit
 * postcode
 * notes
 * userid
 * image
 *  data
 *  description
 *  caption
 *  latitude
 *  longitude
 * 
 */
async function doUpdateDest(dest, image) {
  console.log(`update destination: ${JSON.stringify(dest)}`);
  if (image) {
    console.log(`image: ${JSON.stringify(image)}`);
  }
  const client = await txnStart();
  var image_id;
/*
  if (image) {
    var res = getSingle(`INSERT INTO images (data, uploaded_by, uploaded_on, description, caption, latitude, longitude, location)
    VALUES ($1, $2, NOW(), $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($5, $6), 4326))
    RETURNING id`,
      [image.data, dest.userid, image.description, image.caption, image.longitude, image.latitude], client);
    if (!res) {
      txnRollback(client);
      return { error: 'Unable to store new image' };
    }
    if (res.error) {
      txnRollback(client);
      return res;
    }
    image_id = res.id;
  }
*/

  res = getSingle(`UPDATE dests SET company=$1, postcode=$2, unit=$3, site=$4, loc=ST_SetSRID(ST_MakePoint($5, $6), 4326), notes=$7
  WHERE id=$8
  RETURNING *`, [dest.company, dest.postcode, dest.unit, dest.site, dest.lon, dest.lat, dest.notes, dest.id], client);
  if (!res) {
    txnRollback(client);
    return { error: 'Unable to update destination' };
  }
  if (res.error) {
    txnRollback(client);
    return res;
  }

/*
  if (image) {
    var link = getSingle(`INSERT INTO destimages(image_id, dest_id, role)
  VALUES ($1, $2, $3)
  RETURNING *`, [image_id, res.id, image.role], client);
    if (!link) {
      txnRollback(client);
      return { error: 'Unable to link image to new destination' };
    }
    if (link.error) {
      txnRollback(client);
      return link;
    }
  }
*/
  txnCommit(client);
  return res;
}

module.exports = {
  newID, getUserById, getUserByEmail, checkCredentials, createSession, resumeSession, deleteSession, getDestById, getNearbyDests, searchDests, doActivate, doRegister, doResend,
  updateUserById, changePassword, setPassword, doAddDest, doUpdateDest
};
