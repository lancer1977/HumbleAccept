// content.js

function extractKeys() {
  const keys = [];

  document.querySelectorAll('.keyfield.enabled').forEach((keyBlock) => {
    const key = keyBlock.querySelector('.keyfield-value')?.textContent.trim();
    const title = keyBlock
      .closest('.key-redeemer')
      ?.querySelector('.heading-text h4')?.textContent.trim();

    if (key && title) {
      keys.push({ title, key });
    }
  });

  return keys;
}

function createKeyTable(keys) {
  const container = document.createElement('div');
  container.id = 'steam-key-popup';
  container.style = `
    position: fixed;
    top: 50px;
    right: 20px;
    max-height: 400px;
    overflow-y: auto;
    width: 400px;
    background: white;
    border: 1px solid #ccc;
    padding: 10px;
    z-index: 9999;
    font-family: sans-serif;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;

  const closeButton = document.createElement('button');
  closeButton.textContent = '✖ Close';
  closeButton.style = 'float: right; margin-bottom: 10px;';
  closeButton.onclick = () => container.remove();

  const table = document.createElement('table');
  table.style = 'width: 100%; border-collapse: collapse;';

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th style="text-align:left; border-bottom:1px solid #ccc;">Key</th>
    <th style="text-align:left; border-bottom:1px solid #ccc;">Game</th>
    <th style="text-align:left; border-bottom:1px solid #ccc;">Action</th>
  `;
  table.appendChild(headerRow);

  keys.forEach(({ title, key }) => {
    const row = document.createElement('tr');
    const keyCell = document.createElement('td');
    keyCell.style = 'padding: 4px 8px; font-family: monospace;';
    keyCell.textContent = key;

    const titleCell = document.createElement('td');
    titleCell.style = 'padding: 4px 8px; vertical-align: top;';
    titleCell.textContent = title;

    const actionCell = document.createElement('td');
    actionCell.style = 'padding: 4px 8px; vertical-align: top;';

    const redeemButton = document.createElement('button');
    redeemButton.textContent = 'Redeem';
    redeemButton.style =
      'padding: 4px 8px; background:#1b2838; color:#c7d5e0; border:1px solid #66c0f4; border-radius:3px; cursor:pointer;';
    redeemButton.onclick = () => {
      const redeemUrl = `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
        key
      )}`;
      window.open(redeemUrl, '_blank');
    };

    actionCell.appendChild(redeemButton);
    row.appendChild(keyCell);
    row.appendChild(titleCell);
    row.appendChild(actionCell);
    table.appendChild(row);
  });

  container.appendChild(closeButton);
  container.appendChild(table);
  document.body.appendChild(container);
}

function createFloatingButton() {
  const button = document.createElement('button');
  button.textContent = '📋 Get All Keys';
  button.style = `
    position: fixed;
    top: 10px;
    right: 20px;
    z-index: 9999;
    padding: 8px 12px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
  `;

  button.onclick = () => {
    const keys = extractKeys();
    if (keys.length === 0) {
      alert('No revealed Steam keys found.');
    } else {
      createKeyTable(keys);
    }
  };

  document.body.appendChild(button);
}

window.addEventListener('load', createFloatingButton);
