var express = require('express');
var router = express.Router();

const email = require('../email');
const db = require('../database');

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
  const email = req.params.id;
  const result = await db.getUserByEmail(email);
  console.log(`getUserByEmail returns ${JSON.stringify(result)}`);
  if (result != null) {
    res.status(400).send('Email address already registered');
    return;
  }

  result = db.doRegister(req.params);
  if (result.error) {
    res.status(400).json(result);
    return;
  }
  email.sendEmail(result);
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

  email.sendEmail(result);
  res.status(200).send();
})

/*
 * GET on /users/activate
 */
router.get('/activate', async (req, res, next) => {
  /*
 * check account email_validated=false
 * check validation_sent has not expired (2 days?)
 * update validation_sent=null, email_validated=true, validation_sent=null
 */
  const id = req.query.id;
  const x = req.query.x;
  if (!x) {
    res.status(400).send('Malformed request');
    return;
  }
  result = db.doActivate(id, x);
  if (result.error) {
    res.status(400).json(result);
    return;
  }

  email.sendWelcome(result);
  res.status(200).send();
});

module.exports = router;
