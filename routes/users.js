var express = require('express');
var router = express.Router();

const db = require('../database');

/* GET users listing. */
router.get('/:id', async (req, res, next) => {
  const id = req.params.id;
  const result = await db.getUserById(id);
  console.log(`getUserById returns ${JSON.stringify(result)}`);
  if(result == null) {
    res.status(404).send('User not found');
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.status(200).json(result);
});

module.exports = router;
