require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const db = require('./database');
var axios = require('axios');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var destsRouter = require('./routes/dests');
var authRouter = require('./routes/auth');
var sessionRouter = require('./routes/session');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/v1/', indexRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/dests', destsRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/session', sessionRouter);
app.get('/api/v1/status', function (req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.send({ status: 'ok' });
  res.end();
});

app.post('/api/v1/login', async (req, res, next) => {
  console.log(`login body: ${JSON.stringify(req.body)}`);
  const user = req.body.user;
  const password = req.body.password;
  const device = req.body.device || "unknown";
  res.set('Cache-Control', 'no-store');

  const result = await db.checkCredentials(user, password);
  console.log(`checkCredentials (${user}, ${password}) returns ${JSON.stringify(result)}`);
  if (result == null) {
    res.status(404).send('User not found');
    return;
  }
  if (result.error) {
    res.status(200).send(result);
    return;
  }
  session = await db.createSession(result.id, device);
  if (session == null) {
    res.status(500).json({ error: "Unable to create session" });
  }
  if (session.error) {
    res.status(500).json(session);
  }
  result.session_id = session.session_id;
  res.status(200).json(result);
});

app.get('/api/v1/w3w', async (req, res, next) => {
  const lat = req.query.lat;
  const lon = req.query.lon;
  if (!lat || !lon) {
    res.status(400).send('Missing parameter');
    return;
  }
  const url = `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lon}&key=${process.env.W3W_API_KEY}&language=en&format=json`;
  var response;
  try {
    response = await axios.get(url);
    console.log(`w3w returned ${JSON.stringify(response.data)}`);
    if (response.error) {
      res.status(400).send({ error: response.error.message });
      return;
    }
    res.status(200).send({ w3w: response.data.words });
    return;
  } catch (e) {
    res.status(500).send(e);
  }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
