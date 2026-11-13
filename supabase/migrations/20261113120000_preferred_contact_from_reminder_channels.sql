-- 20261113120000_preferred_contact_from_reminder_channels.sql
--
-- "Preferred method of contact" is now ONE switch: humans.whatsapp
-- (true = WhatsApp, false = SMS). It is what the messaging policy
-- (supabase/functions/_shared/channelPolicy.ts) has always read to decide
-- whether WhatsApp may be tried, and the customer profile now shows it as two
-- pills, WhatsApp / SMS.
--
-- The old "Reminder preferences" pills wrote humans.reminder_channels, which
-- nothing ever read. Where staff used them to say "SMS, not WhatsApp" but the
-- WhatsApp flag was still on, that choice was silently ignored. This carries
-- those explicit choices over, once, so those customers are texted.
--
-- Data only, no schema change. Idempotent: a second run matches no rows.
-- Safe to apply before the app change deploys: the existing notifiers already
-- text a customer whose WhatsApp flag is off. It never touches an opt-out
-- (whatsapp_opted_out / sms_opted_out are separate columns, left alone).
-- humans.reminder_channels is left in place, unread.

update public.humans
   set whatsapp = false
 where whatsapp is true
   and jsonb_typeof(reminder_channels) = 'array'
   and reminder_channels ? 'sms'
   and not reminder_channels ? 'whatsapp';
