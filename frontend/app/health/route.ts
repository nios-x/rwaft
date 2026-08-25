import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      service: "frontend",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
