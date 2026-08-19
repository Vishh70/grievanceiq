// src/services/aiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

/**
 * Extracts JSON from a markdown string (handles ```json ... ``` blocks).
 */
const extractJson = (text) => {
  try {
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Failed to parse Gemini response as JSON.');
  }
};

/**
 * Analyze the complaint using Gemini.
 * Expects the complaint text and an optional base64 image string.
 */
async function analyzeComplaint(text, imageBase64 = null, mimeType = null) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY is not set. Using fallback mock analysis.');
    return {
      category: 'Other',
      priority: 'Medium',
      recommendedDepartment: 'General Admin'
    };
  }

  const prompt = `
You are an expert AI civic assistant for the GrievanceIQ platform.
Analyze the following civic complaint and provide a structured JSON response.

Categories must be one of: "Roads", "Water Supply", "Electricity", "Drainage", "Waste Management", "Public Infrastructure", "Other".
Priority must be one of: "Critical", "High", "Medium", "Low".
Determine the most appropriate Indian municipal "recommendedDepartment".
Extract 3-5 relevant "keywords" summarizing the core issue (e.g., ["pothole", "accident risk", "MG road"]).

Rules:
- "Critical" priority for major safety hazards or immediate health risks (e.g., exposed live wire, severe water contamination, major road collapse).
- "High" priority for significant disruptions to daily life (e.g., power outage, no water supply for days).
- "Medium" priority for standard civic issues (e.g., potholes, uncollected garbage, broken streetlights).
- "Low" priority for minor aesthetic or long-term requests (e.g., park maintenance, faded road signs).

Respond strictly with ONLY a JSON object in this format:
{
  "category": "...",
  "priority": "...",
  "recommendedDepartment": "...",
  "keywords": ["...", "..."]
}

Complaint Text: "${text}"
`;

  try {
    let result;
    if (imageBase64 && mimeType) {
      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      };
      result = await model.generateContent([prompt, imagePart]);
    } else {
      result = await model.generateContent(prompt);
    }

    const responseText = result.response.text();
    const json = extractJson(responseText);

    return {
      category: json.category || 'Other',
      priority: json.priority || 'Medium',
      recommendedDepartment: json.recommendedDepartment || 'General Admin',
      keywords: json.keywords || []
    };
  } catch (err) {
    console.error('Gemini Analysis Error:', err.message);
    return {
      category: 'Other',
      priority: 'Medium',
      recommendedDepartment: 'General Admin',
      keywords: []
    };
  }
}

module.exports = { analyzeComplaint };
