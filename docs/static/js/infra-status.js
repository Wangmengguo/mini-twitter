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
    
    // Calculate overall health based on critical models
    let worstStatus = 'up';
    let maxLatency = 0;
    
    for (const provider of Object.values(infraData.providers || {})) {
        for (const model of provider.models || []) {
            if (model.critical) {
                if (model.status === 'down' || model.status === 'error') {
                    worstStatus = 'down';
                }
                
                const latency = parseLatency(model.latency);
                maxLatency = Math.max(maxLatency, latency);
            }
        }
    }
    
    toggle.classList.remove('status-healthy', 'status-degraded', 'status-down');
    
    if (worstStatus === 'down') {
        toggle.classList.add('status-down');
    } else if (maxLatency > 5000) {
        toggle.classList.add('status-down');
    } else if (maxLatency > 2000) {
        toggle.classList.add('status-degraded');
    } else {
        toggle.classList.add('status-healthy');
    }
}

function parseLatency(latencyStr) {
    if (!latencyStr) return 0;
    return parseFloat(latencyStr.replace('ms', '')) || 0;
}

function renderInfraModal() {
    if (!infraData) return;
    
    const container = document.getElementById('infraStatus');
    const lastUpdateEl = document.getElementById('infraLastUpdate');
    
    if (!container) return;
    
    let html = '';
    
    for (const [key, provider] of Object.entries(infraData.providers || {})) {
        html += `
            <div class="provider-group">
                <div class="provider-header">
                    <span class="provider-icon">${provider.icon}</span>
                    <span class="provider-name">${provider.name}</span>
                </div>
                <div class="provider-models">
        `;
        
        for (const model of provider.models || []) {
            const starIcon = model.star ? '<span class="model-star">⭐</span>' : '';
            html += `
                <div class="status-card">
                    <div class="status-card-left">
                        <span class="status-dot status-${model.status}"></span>
                        ${starIcon}
                        <span class="status-name">${model.display}</span>
                    </div>
                    <span class="status-latency">${model.latency || 'N/A'}</span>
                </div>
            `;
        }
        
        html += `
                </div>
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
