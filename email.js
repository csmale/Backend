"use strict";
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.xs4all.nl",
  port: 465,
  secure: true,
  auth: {
    // TODO: replace `user` and `pass` values from <https://forwardemail.net>
    user: "csmale@xs4all.nl",
    pass: "nagsheadpeckham",
  },
});

// async..await is not allowed in global scope, must use a wrapper
async function doSend(mail) {
  // send mail with defined transport object
  const info = await transporter.sendMail(mail);

  console.log(`Message to ${mail.to} sent: ${info.messageId}`);
  // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

  //
  // NOTE: You can go to https://forwardemail.net/my-account/emails to see your email delivery status and preview
  //       Or you can use the "preview-email" npm package to preview emails locally in browsers and iOS Simulator
  //       <https://github.com/forwardemail/preview-email>
  //
}

async function sendEmail(user) {
    const mail = {
        from: '"GateMaster" <colin.smale@xs4all.nl>', // sender address
        to: user.email,
        subject: "Activate your GateMaster account",
        text: "Hello world?", // plain text body
        html: "<b>Hello world?</b>", // html body
      }
    return doSend(mail);
}

async function sendWelcome(user) {
    const mail = {
        from: '"GateMaster" <colin.smale@xs4all.nl>', // sender address
        to: user.email,
        subject: "Welcome to GateMaster", // Subject line
        text: "Hello world?", // plain text body
        html: "<b>Hello world?</b>", // html body
      }
    return doSend(mail);
}

module.exports = { sendEmail, sendWelcome };
