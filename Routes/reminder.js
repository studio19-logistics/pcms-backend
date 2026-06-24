const express = require('express')
const router = express.Router()
const Brevo = require('@getbrevo/brevo')

const client = Brevo.ApiClient.instance
client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

const transactionalApi = new Brevo.TransactionalEmailsApi()

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body
  console.log('Attempting email send to:', to)
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to, subject, or html' })
  }

  try {
    const recipients = to.split(',').map(email => ({ email: email.trim() }))

    const email = new Brevo.SendSmtpEmail()
    email.sender = { name: 'Studio19 PCMS', email: 'studio19.logistics@gmail.com' }
    email.to = recipients
    email.subject = subject
    email.htmlContent = html

    await transactionalApi.sendTransacEmail(email)
    console.log('Email sent successfully to:', to)
    res.json({ success: true })
  } catch (err) {
    console.log('Email error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router