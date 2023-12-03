var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const db = require('./database');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var destsRouter = require('./routes/dests');
var authRouter = require('./routes/auth');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/dests', destsRouter);
app.use('/auth', authRouter);
app.get('/status', function(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.send({ status: 'ok' });
  res.end();
});
app.post('/login', async (req, res, next) => {
  console.log(`login body: ${JSON.stringify(req.body)}`);
  const user = req.body.user;
  const password = req.body.password;

  const result = await db.checkCredentials(user, password);
  console.log(`checkCredentials (${user}, ${password}) returns ${JSON.stringify(result)}`);
  if(result == null) {
    res.status(404).send('User not found');
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.status(200).json(result);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
