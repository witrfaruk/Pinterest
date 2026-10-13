-- 2. Create the app_config Table for Secure Cloud Configuration
CREATE TABLE IF NOT EXISTS public.app_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Service role full access app_config'
    ) THEN
        CREATE POLICY "Service role full access app_config" ON public.app_config
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Seed default configuration
INSERT INTO public.app_config (key, value, description)
VALUES 
    ('SMTP_USER', 'your_email@gmail.com', 'Sender Gmail address for alert notifications'),
    ('SMTP_PASS', 'your_google_app_password', 'Google App Password for sender email'),
    ('ALERT_RECIPIENTS', 'your_alert_recipient@example.com', 'Comma-separated recipient emails for low queue alerts'),
    ('ALERT_THRESHOLD', '5', 'Minimum number of pending pins remaining before triggering alert email'),
    ('GOOGLE_SHEET_WEBHOOK_URL', '', 'Google Sheet webhook URL for Finmunt log sync')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = NOW();
