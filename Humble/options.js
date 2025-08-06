document.addEventListener('DOMContentLoaded', () => {
  const enableAuto = document.getElementById('enableAuto');
  const apiEndpoint = document.getElementById('apiEndpoint');
  const apiKey = document.getElementById('apiKey');
  const closeTab = document.getElementById('closeTab');
  const status = document.getElementById('status');

  // Populate the form with stored settings
  chrome.storage.sync.get(
    ['enableAuto', 'apiEndpoint', 'apiKey', 'closeTab'],
    (items) => {
      enableAuto.checked = items.enableAuto !== false;
      apiEndpoint.value = items.apiEndpoint || '';
      apiKey.value = items.apiKey || '';
      closeTab.checked = items.closeTab !== false;
    }
  );

  // Save settings when the form is submitted
  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    chrome.storage.sync.set(
      {
        enableAuto: enableAuto.checked,
        apiEndpoint: apiEndpoint.value.trim(),
        apiKey: apiKey.value.trim(),
        closeTab: closeTab.checked
      },
      () => {
        status.textContent = 'Settings saved.';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      }
    );
  });
});
