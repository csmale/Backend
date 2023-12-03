var express = require('express');
var router = express.Router();

const sendmail = require('../email');
const db = require('../database');
const { isValidEmail } = require('../utils');

/* GET users listing. */
router.get('/:id', async (req, res, next) => {
  const id = req.params.id;
  const result = await db.getUserById(id);
  console.log(`getUserById returns ${JSON.stringify(result)}`);
  if (result == null) {
    res.status(404).send('User not found');
    return;
  }
  res.set('Cache-Control', 'no-store');
  if (result.is_locked) {
    res.status(400).send('Account is locked');
    return;
  }
  res.status(200).json(result);
});

/* PUT on /users/:id */
router.put('/:id', async (req, res, next) => {
  const result = await db.updateUserById(req.body);
  console.log(`updateUserById returns ${JSON.stringify(result)}`);
  if (result == null) {
    res.status(404).send('User not found');
    return;
  }
  res.set('Cache-Control', 'no-store');
  if (result.is_locked) {
    res.status(400).send('Account is locked');
    return;
  }
  res.status(200).json(result);
});

/*
 * POST on /users/register
 */
router.post('/register', async (req, res, next) => {
  /*
   * check email is unregistered
   * insert new record, unlocked, validation_sent=now(), email_validated=false, nonce=gen_uuid()
   * send email
   */

  res.set('Cache-Control', 'no-store');
  const email = req.body.email;
  if(!email || email=='') {
    res.status(400).send('No email address supplied');
    return;
  }
  if(!isValidEmail(email)) {
    res.status(400).send('Invalid email address');
    return;
  }
  if(!req.body.username || req.body.username == '') {
    res.status(400).send('No username supplied');
    return;
  }
  const existing = await db.getUserByEmail(email);
  console.log(`getUserByEmail returns ${JSON.stringify(existing)}`);
  if (existing) {
    res.status(400).send('Email address already registered');
    return;
  }
  if(!req.body.userid) req.body.userid = req.body.email;

  const result = await db.doRegister(req.body);
  if (result.error) {
    res.status(400).json(result);
    return;
  }
  
  sendmail.sendActivate(result);
  res.status(200).json(result);
});

/*
 * POST on /users/resend
 */
router.post('/resend', async (req, res, next) => {
  /*
   * resend validation email
   * check account email_validated=false
   * update validation_sent=now()
   * send email
   */

  var result = db.doResend(email);
  if (result.error) {
    res.status(400).json(result);
    return;
  }

  sendmail.sendActivate(result);
  res.status(200).send();
})

module.exports = router;
