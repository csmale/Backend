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

/* POST on /dests to add a new destination */
router.post('/', async(req, res, next) => {
    res.set('Cache-Control', 'no-store');

    const dest = req.body;

    if(dest.company == '' || dest.company.length < 3) {
        res.status(400).send({error: 'No company name'});
        return;
    }
    if(dest.postcode == '') {
        res.status(400).send({error: 'No postcode'});
        return;
    }
    if(dest.site == '') {
        res.status(400).send({error: 'No site'});
        return;
    }
    if(dest.unit == '') {
        res.status(400).send({error: 'No unit'});
        return;
    }
    var pc = dest.postcode.toUpperCase().replace(' ', '');
    var pcregexp = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/;
    var pcregexp2 = /^([A-Z]{1,2}\d[A-Z\d]?)$/;
    var matches = pc.match(pcregexp);
    if (matches && matches.length == 3) {
      pc = `${matches[1]} ${matches[2]}`;
    } else {
      matches = pc.match(pcregexp2);
      if (matches && matches.length == 2) {
        pc = matches[1];
      } else {
        dest.postcode = pc;
        return null;
      }
    }
  
    const result = await db.doAddDest(dest);
    if(!result) {
        res.status(400).send({error: 'Error storing destination'});
    }
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
});

/* PUT on /dests to update (rewrite) destination */
router.put('/:id', async(req, res, next) => {
    res.set('Cache-Control', 'no-store');

    const dest = req.body;
    dest.id = req.params.id;
    console.log(`updating dest: ${JSON.stringify(dest)}`);

    if(dest.company == '' || dest.company.length < 3) {
        res.status(400).send({error: 'No company name'});
        return;
    }
    if(dest.postcode == '') {
        res.status(400).send({error: 'No postcode'});
        return;
    }
    if(dest.site == '') {
        res.status(400).send({error: 'No site'});
        return;
    }
    if(dest.unit == '') {
        res.status(400).send({error: 'No unit'});
        return;
    }
    var pc = dest.postcode.toUpperCase().replace(' ', '');
    var pcregexp = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/;
    var pcregexp2 = /^([A-Z]{1,2}\d[A-Z\d]?)$/;
    var matches = pc.match(pcregexp);
    if (matches && matches.length == 3) {
      pc = `${matches[1]} ${matches[2]}`;
    } else {
      matches = pc.match(pcregexp2);
      if (matches && matches.length == 2) {
        pc = matches[1];
      } else {
        dest.postcode = pc;
        return null;
      }
    }
  
    const result = await db.doUpdateDest(dest);
    if(!result) {
        res.status(400).send({error: 'Error updating destination'});
    }
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.status(200).json(result);
});

module.exports = router;
