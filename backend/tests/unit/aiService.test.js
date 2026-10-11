// tests/unit/aiService.test.js
const {
  analyzeComplaint,
  extractJson,
  getModel,
  FALLBACK_RESPONSE
} = require('../../src/services/aiService');

jest.mock('@google/generative-ai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

describe('AI Service Unit Tests (Gemini Triage)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Model Configuration', () => {
    it('uses gemini-3.8-flash as the default model when GEMINI_MODEL is not set', () => {
      delete process.env.GEMINI_MODEL;
      process.env.GEMINI_API_KEY = 'test_key';
      
      const mockGetGenerativeModel = jest.fn();
      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
      }));

      getModel();
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.8-flash' });
    });

    it('respects custom GEMINI_MODEL environment variable', () => {
      process.env.GEMINI_MODEL = 'gemini-3.6-flash';
      process.env.GEMINI_API_KEY = 'test_key';

      const mockGetGenerativeModel = jest.fn();
      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
      }));

      getModel();
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.6-flash' });
    });
  });

  describe('extractJson Helper', () => {
    it('extracts and parses valid JSON without code fences', () => {
      const raw = '{"category":"Roads","priority":"High"}';
      const parsed = extractJson(raw);
      expect(parsed).toEqual({ category: 'Roads', priority: 'High' });
    });

    it('extracts and parses JSON wrapped in markdown ```json ... ``` fences', () => {
      const raw = '```json\n{\n  "category": "Water Supply",\n  "severityScore": 7\n}\n```';
      const parsed = extractJson(raw);
      expect(parsed).toEqual({ category: 'Water Supply', severityScore: 7 });
    });

    it('throws when the content is malformed JSON', () => {
      const raw = '```json\n{ invalid json content }\n```';
      expect(() => extractJson(raw)).toThrow('Failed to parse Gemini response as JSON.');
    });
  });

  describe('analyzeComplaint Function', () => {
    it('returns fallback immediately when GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await analyzeComplaint('Pothole on the road');
      expect(result).toEqual(FALLBACK_RESPONSE);
      expect(result.category).toBe('Other');
      expect(result.priority).toBe('Medium');
      expect(result.severityScore).toBe(5);
      expect(result.suggestedAction).toBe('Field inspection and municipal assessment required');
    });

    it('handles valid API response and formats structured triage output correctly', async () => {
      process.env.GEMINI_API_KEY = 'valid_key';

      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Roads',
            priority: 'Critical',
            recommendedDepartment: 'Road Department',
            keywords: ['pothole', 'accident', 'MG Road'],
            severityScore: 9,
            safetyHazards: ['Traffic Obstruction', 'Accident Hazard'],
            suggestedAction: 'Immediate asphalt patching required'
          })
        }
      });

      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: () => ({
          generateContent: mockGenerateContent
        })
      }));

      const result = await analyzeComplaint('Deep pothole causing accidents on MG Road');

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        category: 'Roads',
        priority: 'Critical',
        recommendedDepartment: 'Road Department',
        keywords: ['pothole', 'accident', 'MG Road'],
        severityScore: 9,
        safetyHazards: ['Traffic Obstruction', 'Accident Hazard'],
        suggestedAction: 'Immediate asphalt patching required'
      });
    });

    it('handles malformed JSON from API by falling back gracefully without crashing', async () => {
      process.env.GEMINI_API_KEY = 'valid_key';

      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => 'Sorry, I cannot analyze this request right now.'
        }
      });

      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: () => ({
          generateContent: mockGenerateContent
        })
      }));

      const result = await analyzeComplaint('Some issue');
      expect(result).toEqual(FALLBACK_RESPONSE);
    });

    it('handles API network/auth error by returning fallback', async () => {
      process.env.GEMINI_API_KEY = 'valid_key';

      const mockGenerateContent = jest.fn().mockRejectedValue(new Error('Network error or quota exceeded'));

      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: () => ({
          generateContent: mockGenerateContent
        })
      }));

      const result = await analyzeComplaint('Some issue');
      expect(result).toEqual(FALLBACK_RESPONSE);
    });

    it('clamps or defaults invalid severityScore to 5', async () => {
      process.env.GEMINI_API_KEY = 'valid_key';

      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Electricity',
            priority: 'High',
            recommendedDepartment: 'Electricity Department',
            keywords: ['wire'],
            severityScore: 99, // Out of range 1-10
            safetyHazards: ['Shock'],
            suggestedAction: 'Isolate wire'
          })
        }
      });

      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: () => ({
          generateContent: mockGenerateContent
        })
      }));

      const result = await analyzeComplaint('Sparking wire');
      expect(result.severityScore).toBe(5);
    });

    it('recovers via fallback model when primary model returns 503 high demand spike', async () => {
      process.env.GEMINI_API_KEY = 'valid_key';
      process.env.GEMINI_MODEL = 'gemini-3.8-flash';
      process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
      process.env.GEMINI_MAX_RETRIES = '0'; // Fast execution in unit test

      const mockPrimaryGen = jest.fn().mockRejectedValue(new Error('[503 Service Unavailable] This model is currently experiencing high demand.'));
      const mockFallbackGen = jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            category: 'Electricity',
            priority: 'Critical',
            recommendedDepartment: 'Electrical Dept',
            keywords: ['spark', 'wire'],
            severityScore: 10,
            safetyHazards: ['Shock'],
            suggestedAction: 'Repair immediately'
          })
        }
      });

      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: jest.fn(({ model }) => {
          if (model === 'gemini-3.8-flash') {
            return { generateContent: mockPrimaryGen };
          }
          return { generateContent: mockFallbackGen };
        })
      }));

      const result = await analyzeComplaint('Live sparking wire');
      expect(mockPrimaryGen).toHaveBeenCalled();
      expect(mockFallbackGen).toHaveBeenCalled();
      expect(result.category).toBe('Electricity');
      expect(result.priority).toBe('Critical');
      expect(result.severityScore).toBe(10);
    });
  });
});
