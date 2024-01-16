var express = require('express');
var router = express.Router();

const db = require('../database');
const email = require('../email.js');
const ejs = require('ejs');

/*
 * GET on /auth/activate
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
    result = await db.doActivate(id, x);
    console.log(`doActivate returned ${JSON.stringify(result)}`);
    if (result.error) {
        res.status(400).json(result);
        return;
    }

    email.sendWelcome(result);
    const html = await ejs.renderFile('./email/accountactivated.htm', result);
    res.status(200).send(html);

    // account still can't be used as it doesn't have a password...
});

router.get('/activate', async (req, res, next) => {
    /*
   * check account email_validated=false
   * check validation_sent has not expired (2 days?)
   * update validation_sent=null, email_validated=true, validation_sent=null
   */
    const id = req.query.id;
    const x = req.query.x;
    if (!id || !x) {
        res.status(400).send('Malformed request');
        return;
    }
    result = await db.doActivate(id, x);
    console.log(`doActivate returned ${JSON.stringify(result)}`);
    if (result.error) {
        res.status(400).json(result);
        return;
    }

    email.sendWelcome(result);
    const html = await ejs.renderFile('./email/accountactivated.htm', result);
    res.status(200).send(html);
});

module.exports = router;
