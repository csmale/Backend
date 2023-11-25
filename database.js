
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

/*
db.one('SELECT $1 AS value', 123)
  .then((data) => {
    console.log('DATA:', data.value)
  })
  .catch((error) => {
    console.log('ERROR:', error)
  })
*/

const { randomUUID } = require('crypto'); // Added in: node v14.17.0

// '89rct5ac2-8493-49b0-95d8-de843d90e6ca'

function newID() {
  return randomUUID();
}

async function getSingle(q, params) {
  var res;
  try {
    res = await pool.query(q, params);
  } catch (error) {
    console.log(`Error from DB: ${error}`);
    console.log(`Query: ${q}`);
    console.log(`Params: ${JSON.stringify(params)}`);
    throw error;
  }
  // console.log(JSON.stringify(res));
  return res.rows[0];
}

async function getMulti(q, params) {
  var res;
  try {
    res = await pool.query(q, params);
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

async function checkCredentials(user, password) {
  console.log(`checking credentials for user ${user}`);
  let lowerUser = user.toLowerCase();
  let res = await getSingle('SELECT *, (pwhash = crypt($2, pwhash)) AS password_match FROM users WHERE username = $1', [lowerUser, password]);
  // console.log(`check: ${JSON.stringify(res)}`);
  if (!res || !res.password_match) {
    return { error: 'Incorrect user name or password' };
  }
  delete res.pwhash;
  delete res.password_match;
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

module.exports = { newID, getUserById, checkCredentials, getDestById, getNearbyDests, searchDests };
