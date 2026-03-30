import { createClient } from '@supabase/supabase-js'

// 현재 프로젝트(unnvm...)의 주소와 키를 강제로 설정합니다.
const supabaseUrl = "https://unnvmwfaymaukqtofroq.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubnZtd2ZheW1hdWtxdG9mcm9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU0MDcsImV4cCI6MjA5MDMwMTQwN30._MBbkEBD9v1Sl7FatqEAQ2QXzYf0sPclUBL-Oy3ImF0"

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  }
})