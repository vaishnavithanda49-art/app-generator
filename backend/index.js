const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function callAI(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const text = response.data.choices[0].message.content;
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return cleaned;
}

// STAGE 1: Extract Intent
async function extractIntent(userInput) {
  const prompt = `
    You are an app architect. Extract the key features from this request.
    Request: "${userInput}"
    
    Respond ONLY with valid JSON, no extra text:
    {
      "appName": "name of app",
      "features": ["feature1", "feature2"],
      "entities": ["entity1", "entity2"],
      "roles": ["role1", "role2"],
      "hasAuth": true,
      "hasPayments": false
    }
  `;
  const result = await callAI(prompt);
  return JSON.parse(result);
}

// STAGE 2: System Design
async function systemDesign(intent) {
  const prompt = `
    You are a system architect. Based on this intent, design the app system.
    Intent: ${JSON.stringify(intent)}
    
    Respond ONLY with valid JSON, no extra text:
    {
      "pages": ["page1", "page2"],
      "apiEndpoints": ["/api/endpoint1", "/api/endpoint2"],
      "dbTables": ["table1", "table2"],
      "relationships": ["table1 has many table2"]
    }
  `;
  const result = await callAI(prompt);
  return JSON.parse(result);
}

// STAGE 3: Generate Full Schema
async function generateSchema(intent, design) {
  const prompt = `
    You are a schema generator. Generate complete app schema.
    Intent: ${JSON.stringify(intent)}
    Design: ${JSON.stringify(design)}
    
    Respond ONLY with valid JSON, no extra text:
    {
      "database": {
        "tables": [
          {
            "name": "tableName",
            "fields": [
              {"name": "fieldName", "type": "string", "required": true}
            ]
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "path": "/api/example",
            "method": "GET",
            "description": "what it does",
            "requestBody": {},
            "response": {}
          }
        ]
      },
      "ui": {
        "pages": [
          {
            "name": "pageName",
            "components": ["component1", "component2"],
            "route": "/route"
          }
        ]
      },
      "auth": {
        "roles": [],
        "permissions": {}
      }
    }
  `;
  const result = await callAI(prompt);
  return JSON.parse(result);
}

// STAGE 4: Validate and Repair
async function validateAndRepair(schema) {
  const issues = [];
  
  if (!schema.database) issues.push("missing database schema");
  if (!schema.api) issues.push("missing api schema");
  if (!schema.ui) issues.push("missing ui schema");
  if (!schema.auth) issues.push("missing auth schema");

  if (issues.length > 0) {
    const prompt = `
      This JSON schema has issues: ${issues.join(', ')}
      Fix this schema and return valid complete JSON only, no extra text:
      ${JSON.stringify(schema)}
    `;
    const repaired = await callAI(prompt);
    return { schema: JSON.parse(repaired), wasRepaired: true, issues };
  }

  return { schema, wasRepaired: false, issues: [] };
}

// MAIN ROUTE
app.post('/generate', async (req, res) => {
  const { userInput } = req.body;

  if (!userInput) {
    return res.status(400).json({ error: 'Please provide userInput' });
  }

  try {
    console.log('Stage 1: Extracting intent...');
    const intent = await extractIntent(userInput);

    console.log('Stage 2: System design...');
    const design = await systemDesign(intent);

    console.log('Stage 3: Generating schema...');
    const schema = await generateSchema(intent, design);

    console.log('Stage 4: Validating...');
    const { schema: finalSchema, wasRepaired, issues } = await validateAndRepair(schema);

    console.log('Done!');
    res.json({
      success: true,
      input: userInput,
      pipeline: {
        stage1_intent: intent,
        stage2_design: design,
        stage3_schema: finalSchema,
        stage4_validation: { wasRepaired, issues }
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
// STAGE 5: Generate Code
app.post('/generate-code', async (req, res) => {
  const { schema } = req.body;

  if (!schema) {
    return res.status(400).json({ error: 'Please provide schema' });
  }

  try {
    console.log('Generating code from schema...');

    // Generate SQL
    const sqlPrompt = `
      Based on this database schema, generate SQL CREATE TABLE statements.
      Schema: ${JSON.stringify(schema.database)}
      Respond ONLY with SQL code, no extra text.
    `;
    const sqlCode = await callAI(sqlPrompt);

    // Generate Express backend code
    const backendPrompt = `
      Based on these API endpoints, generate a basic Express.js server code.
      Endpoints: ${JSON.stringify(schema.api)}
      Respond ONLY with JavaScript code, no extra text.
    `;
    const backendCode = await callAI(backendPrompt);

    // Generate React frontend code
    const frontendPrompt = `
      Based on these UI pages, generate basic React components code.
      Pages: ${JSON.stringify(schema.ui)}
      Respond ONLY with React JSX code, no extra text.
    `;
    const frontendCode = await callAI(frontendPrompt);

    res.json({
      success: true,
      code: {
        sql: sqlCode,
        backend: backendCode,
        frontend: frontendCode
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
app.get('/', (req, res) => {
  res.json({ message: 'App Generator API is running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});