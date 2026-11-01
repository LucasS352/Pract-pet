const { exec } = require('child_process');

console.log('🔍 Procurando processos travados na porta 3520...');

exec('netstat -ano | findstr :3520', (err, stdout) => {
  if (err || !stdout) {
    console.log('✅ Nenhum processo zumbi encontrado na porta 3520.');
    return;
  }

  const lines = stdout.trim().split('\n');
  const pids = new Set();
  
  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && !isNaN(pid)) {
      pids.add(pid);
    }
  });

  if (pids.size > 0) {
    console.log(`⚠️ Encontrados PIDs zumbis: ${Array.from(pids).join(', ')}. Matando...`);
    pids.forEach(pid => {
      exec(`taskkill /PID ${pid} /F`, (kErr) => {
        if (kErr) {
          console.log(`❌ Falha ao matar PID ${pid}:`, kErr.message);
        } else {
          console.log(`💀 PID ${pid} morto com sucesso.`);
        }
      });
    });
  }
});
