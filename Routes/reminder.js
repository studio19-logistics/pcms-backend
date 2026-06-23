const express = require('express')
const router = express.Router()
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body
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
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router