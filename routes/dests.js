var express = require('express');
var router = express.Router();

const db = require('../database');

router.get('/near/:lat/:lon', async (req, res, next) => {
    const latstring = req.params.lat;
    const lat = parseFloat(latstring);
    const lonstring = req.params.lon;
    const lon = parseFloat(lonstring);
    if (!latstring || latstring == '' || isNaN(lat) || !lonstring || lonstring == '' || isNaN(lon) || lat < 40 || lat > 60 || lon < -10 || lon > 10) {
        console.log(`missing location, got (${latstring},${lonstring})`);
        res.status(400).send('missing or improper location');
        return;
    }
    const dist = 5000;
    const result = await db.getNearbyDests(lat, lon, dist);
    console.log(`getNearbyDests returns ${JSON.stringify(result)}`);
    if (result == null) {
        res.status(404).send('Dest not found');
        return;
    }
    res.set('Cache-Control', 'no-store');
    res.status(200).json(result);
});

router.get('/search', async (req, res, next) => {
    var opts = req.query;

    var result = await db.searchDests(opts);
    console.log(`searchDests returns ${JSON.stringify(result)}`);
    if (result.error) {
        res.status(501).send(result.error);
        return;
    }

    res.set('Cache-Control', 'no-store');
    res.status(200).json(result);
});

/* GET dests listing. */
router.get('/:id', async (req, res, next) => {
    const id = req.params.id;
    if(id.length != 36) {
        res.status(400).send('Malformed ID');
        return;
    }
    const result = await db.getDestById(id);
    console.log(`getDestById returns ${JSON.stringify(result)}`);
    if (result == null) {
        res.status(404).send('Dest not found');
        return;
    }
    res.set('Cache-Control', 'no-store');
    res.status(200).json(result);
});

module.exports = router;
