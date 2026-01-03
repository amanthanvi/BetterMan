import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'betterman-frontend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'not configured',
  });
}