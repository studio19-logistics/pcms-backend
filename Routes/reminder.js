const express = require('express')
const router = express.Router()
const brevo = require('@getbrevo/brevo')

const apiInstance = new brevo.TransactionalEmailsApi()
apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body
  console.log('Attempting email send to:', to)
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to, subject, or html' })
  }

  try {
    const recipients = to.split(',').map(email => ({ email: email.trim() }))

    const email = new brevo.SendSmtpEmail()
    email.sender = { name: 'Studio19 PCMS', email: 'studio19.logistics@gmail.com' }
    email.to = recipients
    email.subject = subject
    email.htmlContent = html

    await apiInstance.sendTransacEmail(email)
    console.log('Email sent successfully to:', to)
    res.json({ success: true })
  } catch (err) {
    console.log('Email error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router