"use server";

import axios from "axios";

export async function getAzureSpeechToken() {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    throw new Error("Azure credentials missing on server");
  }

  try {
    const response = await axios.post(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      { headers: { "Ocp-Apim-Subscription-Key": speechKey } },
    );
    return { token: response.data, region: speechRegion };
  } catch (error) {
    console.error("Token fetch failed", error);
    return { error: "Failed to fetch token" };
  }
}
