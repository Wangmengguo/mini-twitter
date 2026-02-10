// Model Health Monitoring
let infraData = null;

async function updateInfraStatus() {
    try {
        const response = await fetch('static/model-status.json');
        if (!response.ok) return;
        infraData = await response.json();
        
        // Update toggle button status indicator
        updateToggleStatus();
        
        // If modal is open, update content
        const modal = document.getElementById('infraModal');
        if (modal && !modal.hidden) {
            renderInfraModal();
        }
    } catch (e) {
        console.error('Failed to update infra status:', e);
    }
}

function updateToggleStatus() {
    if (!infraData) return;
    
    const toggle = document.getElementById('infraToggle');
    if (!toggle) return;
    
    // Calculate overall health
    const statuses = Object.values(infraData.models).map(m => m.status);
    const downCount = statuses.filter(s => s === 'down').length;
    const errorCount = statuses.filter(s => s === 'error').length;
    
    toggle.classList.remove('status-healthy', 'status-degraded', 'status-down');
    
    if (downCount > 0 || errorCount > 1) {
        toggle.classList.add('status-down');
    } else if (errorCount > 0) {
        toggle.classList.add('status-degraded');
    } else {
        toggle.classList.add('status-healthy');
    }
}

function renderInfraModal() {
    if (!infraData) return;
    
    const container = document.getElementById('infraStatus');
    const lastUpdateEl = document.getElementById('infraLastUpdate');
    
    if (!container) return;
    
    let html = '';
    for (const [name, info] of Object.entries(infraData.models)) {
        html += `
            <div class="status-card">
                <div class="status-card-left">
                    <span class="status-dot status-${info.status}"></span>
                    <span class="status-name">${name}</span>
                </div>
                <span class="status-latency">${info.latency}</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    if (lastUpdateEl) {
        lastUpdateEl.textContent = `Last updated: ${infraData.last_updated}`;
    }
}

function initInfraModal() {
    const toggle = document.getElementById('infraToggle');
    const modal = document.getElementById('infraModal');
    const closeBtn = modal?.querySelector('.infra-modal-close');
    
    if (!toggle || !modal) return;
    
    // Open modal
    toggle.addEventListener('click', () => {
        modal.hidden = false;
        renderInfraModal();
    });
    
    // Close modal
    const closeModal = () => {
        modal.hidden = true;
    };
    
    closeBtn?.addEventListener('click', closeModal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initInfraModal();
    updateInfraStatus();
    // Refresh every 5 minutes
    setInterval(updateInfraStatus, 5 * 60 * 1000);
});
