import { GoogleGenAI } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

export const transcribeAudioToUrdu = async (audioBlob: Blob): Promise<string> => {
  try {
    const base64Audio = await blobToBase64(audioBlob);
    
    // Determine mime type (defaulting to webm if not present on blob)
    // Note: Gemini supports common audio/video formats
    const mimeType = audioBlob.type || 'audio/webm';

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: `
            Listen to the audio content carefully. Transcribe the speech with the following STRICT rules:
            
            1. **Base Language (Urdu)**: Write the main speech in standard Urdu script.
            2. **English Words**: If any English word or phrase is spoken, write it in **English script** inside brackets. Example: "Main ne (Laptop) khareeda."
            3. **Arabic/Quranic Ayats**: If any Arabic verse, Quranic Ayat, or religious text is recited, write it in the **original Arabic script**. Do NOT translate it or transliterate it.
            4. **Accuracy**: The transcription must be the closest representation of the voice. 
            5. **Output**: Return ONLY the final transcribed text. Do not add explanations or labels.
            `
          }
        ]
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No transcription generated.");
    }

    return text.trim();
  } catch (error) {
    console.error("Gemini Transcription Error:", error);
    throw error;
  }
};

export const summarizeUrduContent = async (segments: string[]): Promise<string> => {
  try {
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `Here is a list of transcriptions in Urdu:\n\n${joinedText}\n\nPlease provide a concise summary of all these points in Urdu script.`
          }
        ]
      }
    });

    const text = response.text;
    if (!text) return "Could not generate summary.";
    return text.trim();
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    throw error;
  }
};

export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `Context (Transcription):\n"${context}"\n\nUser Question: "${question}"\n\nAnswer the question based on the context provided above. Answer in Urdu unless the question implies otherwise.`
          }
        ]
      }
    });
    
    return response.text || "I could not generate an answer.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
};