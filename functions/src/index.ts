import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'

initializeApp()

export const health = onRequest({ region: 'europe-west3' }, (req, res) => {
  res.status(200).send({ ok: true, service: 'functions', env: process.env.NODE_ENV || 'development' })
})


