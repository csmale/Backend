var express = require('express');
var router = express.Router();

const sendmail = require('../email');
const db = require('../database');
const { isValidEmail } = require('../utils');

router.post('/:id/logout', async (req, res, next) => {
    const id = req.params.id;
    const device = req.body.device;
    console.log(`logoff session ${id}: ${JSON.stringify(req.body)}`)
    result = await db.deleteSession(id, device);
    if (result == null) {
        res.status(500).json({ error: "Unable to delete session" });
        return;
    }
    if (result.error) {
        res.status(500).json(result);
        return;
    }
    res.status(200).json(result);
})

router.post('/:id/resume', async (req, res, next) => {
    const id = req.params.id;
    const device = req.body.device;
    console.log(`resume session ${id}: ${JSON.stringify(req.body)}`)
    result = await db.resumeSession(id, device);
    if (result == null) {
        res.status(500).json({ error: "Unable to resume session" });
        return;
    }
    if (result.error) {
        res.status(500).json(result);
        return;
    }
    res.status(200).json(result);
})

module.exports = router;