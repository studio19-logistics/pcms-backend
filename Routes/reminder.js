const express = require('express')
const router = express.Router()
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000,
})

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body
  console.log('Attempting email send to:', to, '| GMAIL_USER:', process.env.GMAIL_USER)
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to, subject, or html' })
  }
  try {
    await transporter.sendMail({
      from: `"${process.env.REMINDER_FROM_NAME}" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    })
    console.log('Email sent successfully to:', to)
    res.json({ success: true })
  } catch (err) {
    console.log('Email error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router