// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wsrfhwybxhnpldixamqt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzcmZod3lieGhucGxkaXhhbXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTY3MTMsImV4cCI6MjA5Nzg3MjcxM30.gTpmw2wYqAfuuH_WoO9AgYN1klLARAa8kDmTYvbi1HM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
