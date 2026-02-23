-- Add payment tracking fields to service_requests
ALTER TABLE public.service_requests
  ADD COLUMN payment_method text DEFAULT NULL,
  ADD COLUMN payment_term text DEFAULT NULL,
  ADD COLUMN payment_received_at timestamp with time zone DEFAULT NULL;

-- payment_method: 'cash' (à vista) or 'invoiced' (faturado)
-- payment_term: free text like '30 dias', '15/30', etc.
-- payment_received_at: date when payment was actually received
