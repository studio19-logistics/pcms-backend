const express = require('express')
const router = express.Router()
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body
  console.log('Attempting email send to:', to)
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to, subject, or html' })
  }

  try {
    const recipients = to.split(',').map(email => email.trim())

    const { data, error } = await resend.emails.send({
      from: 'Studio19 PCMS <noreply@studio19offices.in>',
      to: recipients,
      subject,
      html,
    })

    if (error) {
      console.log('Resend error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    console.log('Email sent successfully:', data)
    res.json({ success: true })
  } catch (err) {
    console.log('Email error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router