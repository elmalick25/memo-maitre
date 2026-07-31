import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const agentPanelPath = path.resolve('src/components/AgentPanel.jsx');

test('AgentPanel — Popup container, message bubbles, and input textarea have solid opaque backgrounds', () => {
  const fileContent = fs.readFileSync(agentPanelPath, 'utf8');

  // Verify backdrop filter / translucent rgba backgrounds are removed or made solid
  assert.equal(
    fileContent.includes('backdropFilter: "blur('),
    false,
    'AgentPanel ne doit pas utiliser de backdropFilter flou avec transparence'
  );

  // Verify softBg uses solid colors instead of semi-transparent rgba
  assert.equal(
    fileContent.includes('rgba(0,0,0,0.04)'),
    false,
    'AgentPanel ne doit pas utiliser rgba(0,0,0,0.04) transparent pour softBg'
  );

  // Verify shell uses solid opaque background logic
  assert.equal(
    fileContent.includes('isDarkMode ? "#12121c" : "#ffffff"'),
    true,
    'AgentPanel doit utiliser des couleurs opaques solides (#12121c / #ffffff) pour le popup'
  );
});
