-- R-DEC-08: proof-of-payment images live in a private bucket. Nothing reads it directly: the server
-- hands out short-lived signed URLs, for uploads and for viewing, only to members of the paluwagan.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;
