"use strict";
const nodemailer = require("nodemailer");
const ejs = require('ejs');

const transporter = nodemailer.createTransport({
    host: process.env.SMTPHOST,
    port: parseInt(process.env.SMTPPORT),
    secure: true,
    auth: {
        // TODO: replace `user` and `pass` values from <https://forwardemail.net>
        user: process.env.SMTPUSER,
        pass: process.env.SMTPPASS,
    },
});

const activateURL = "https://gm.colinsmale.eu/auth/activate";
const confirmURL = "https://gm.colinsmale.eu/auth/confirm";

// async..await is not allowed in global scope, must use a wrapper
async function doSend(mail) {
    // send mail with defined transport object
    try {
        console.log(`Sending mail from (${mail.from}) to (${mail.to})`);
        const info = await transporter.sendMail(mail);
        console.log(`Message to ${mail.to} sent: ${info.messageId}`);
    } catch (e) {
        console.log(`Unable to send message to ${mail.to}: ${JSON.stringify(e)}`);
    }
    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

    //
    // NOTE: You can go to https://forwardemail.net/my-account/emails to see your email delivery status and preview
    //       Or you can use the "preview-email" npm package to preview emails locally in browsers and iOS Simulator
    //       <https://github.com/forwardemail/preview-email>
    //
}

async function sendActivate(user) {
    const html = await ejs.renderFile('./email/activateaccount.htm', user);
    const mail = {
        from: process.env.MAILFROM, // sender address
        to: user.email,
        subject: "Activate your GateMaster account",
        text: "Activate your GateMaster account", // plain text body
        html: html, // html body
    }
    return doSend(mail);
}

async function sendWelcome(user) {
    const html = await ejs.renderFile('./email/accountactivated.htm', user);
    const mail = {
        from: process.env.MAILFROM, // sender address
        to: user.email,
        subject: "Welcome to GateMaster", // Subject line
        text: "Welcome to GateMaster", // plain text body
        html: html, // html body
    }
    return doSend(mail);
}

async function sendChangeEmail(user) {
    const mail = {
        from: process.env.MAILFROM, // sender address
        to: user.email,
        subject: "Change to your GateMaster password", // Subject line
        text: "Hello world?", // plain text body
        html: "<b>Hello world?</b>", // html body
    }
    return doSend(mail);
}

module.exports = { sendActivate, sendWelcome, sendChangeEmail };
