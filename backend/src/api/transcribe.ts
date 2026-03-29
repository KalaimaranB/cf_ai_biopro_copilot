export async function handleTranscribeRoute(
  request: Request,
  env: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Convert to ArrayBuffer for Workers AI
    const audioBuffer = await audioFile.arrayBuffer();
    const audioArray = new Uint8Array(audioBuffer);

    const result = await env.AI.run("@cf/openai/whisper", {
      audio: [...audioArray],
    });

    const transcript: string = result?.text?.trim() || "";

    return new Response(JSON.stringify({ transcript }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("Whisper transcription error:", err);
    return new Response(
      JSON.stringify({ error: "Transcription failed", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}