#!/usr/bin/env tsx

import { EnhancedManPageParser, type EnhancedManPage } from '../lib/parser/enhanced-man-parser'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { performance } from 'perf_hooks'

const execAsync = promisify(exec)
const DATA_DIR = path.join(process.cwd(), 'data', 'parsed-man-pages-linux')

// Comprehensive list of commands to parse on Linux
const LINUX_COMMANDS = {
  // Core utilities (GNU coreutils)
  coreutils: [
    'ls', 'dir', 'vdir', 'cp', 'dd', 'mv', 'rm', 'shred', 'ln', 'mkdir', 'rmdir',
    'cat', 'tac', 'nl', 'od', 'base32', 'base64', 'fmt', 'pr', 'fold', 'head', 'tail',
    'split', 'csplit', 'wc', 'sum', 'cksum', 'b2sum', 'md5sum', 'sha1sum', 'sha224sum',
    'sha256sum', 'sha384sum', 'sha512sum', 'sort', 'shuf', 'uniq', 'comm', 'ptx', 'tsort',
    'cut', 'paste', 'join', 'tr', 'expand', 'unexpand', 'chmod', 'chown', 'chgrp',
    'touch', 'df', 'du', 'stat', 'sync', 'truncate', 'echo', 'printf', 'yes', 'true',
    'false', 'test', 'expr', 'tee', 'basename', 'dirname', 'pathchk', 'mktemp', 'realpath',
    'pwd', 'stty', 'printenv', 'env', 'id', 'logname', 'whoami', 'groups', 'users', 'who',
    'date', 'arch', 'nproc', 'uname', 'hostname', 'hostid', 'uptime', 'sleep', 'factor',
    'seq', 'nohup', 'timeout', 'kill', 'nice', 'renice', 'stdbuf', 'runcon', 'chcon'
  ],

  // Text processing
  textProcessing: [
    'grep', 'egrep', 'fgrep', 'rgrep', 'sed', 'awk', 'gawk', 'perl', 'cut', 'paste',
    'colrm', 'column', 'col', 'colcrt', 'rev', 'tac', 'nl', 'fmt', 'fold', 'pr',
    'strings', 'tr', 'uniq', 'sort', 'comm', 'diff', 'diff3', 'sdiff', 'cmp', 'patch',
    'ed', 'ex', 'vi', 'vim', 'nano', 'emacs', 'pico', 'joe', 'jed', 'aspell', 'look',
    'spell', 'expand', 'unexpand', 'tabs', 'wc', 'join', 'split', 'csplit', 'tee'
  ],

  // File and directory operations
  fileOperations: [
    'find', 'xargs', 'locate', 'updatedb', 'which', 'whereis', 'type', 'file', 'stat',
    'lsattr', 'chattr', 'tree', 'ncdu', 'du', 'df', 'mount', 'umount', 'fdisk', 'parted',
    'mkfs', 'fsck', 'e2fsck', 'tune2fs', 'blkid', 'findmnt', 'lsblk', 'hdparm', 'smartctl',
    'dd', 'ddrescue', 'rsync', 'rclone', 'scp', 'sftp', 'ftp', 'lftp', 'wget', 'curl',
    'aria2c', 'ln', 'readlink', 'realpath', 'basename', 'dirname', 'mktemp', 'tempfile'
  ],

  // Process management
  processManagement: [
    'ps', 'pstree', 'top', 'htop', 'atop', 'iotop', 'iftop', 'nethogs', 'kill', 'killall',
    'pkill', 'pgrep', 'pidof', 'fuser', 'lsof', 'strace', 'ltrace', 'ptrace', 'gdb',
    'jobs', 'fg', 'bg', 'nohup', 'disown', 'nice', 'renice', 'ionice', 'chrt', 'taskset',
    'cpulimit', 'cgroups', 'systemd-cgls', 'systemd-cgtop', 'watch', 'timeout', 'time'
  ],

  // Network tools
  networking: [
    'ping', 'ping6', 'traceroute', 'traceroute6', 'tracepath', 'mtr', 'dig', 'host',
    'nslookup', 'whois', 'arp', 'ip', 'ifconfig', 'route', 'netstat', 'ss', 'nc', 'netcat',
    'ncat', 'socat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync', 'curl', 'wget', 'lynx',
    'w3m', 'links', 'tcpdump', 'tshark', 'nmap', 'masscan', 'iptables', 'ip6tables',
    'firewalld', 'ufw', 'fail2ban', 'nftables', 'tc', 'ethtool', 'mii-tool', 'iwconfig',
    'iw', 'hostnamectl', 'timedatectl', 'networkctl', 'resolvectl'
  ],

  // System administration
  systemAdmin: [
    'systemctl', 'service', 'chkconfig', 'update-rc.d', 'init', 'telinit', 'runlevel',
    'shutdown', 'reboot', 'halt', 'poweroff', 'systemd', 'journalctl', 'dmesg', 'syslog',
    'logger', 'logrotate', 'cron', 'crontab', 'at', 'batch', 'anacron', 'systemd-timer',
    'sudo', 'su', 'passwd', 'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel',
    'groupmod', 'chpasswd', 'chage', 'gpasswd', 'newgrp', 'id', 'whoami', 'w', 'last',
    'lastlog', 'faillog', 'pam', 'visudo', 'sudoedit', 'adduser', 'deluser', 'addgroup',
    'delgroup', 'vipw', 'vigr', 'pwck', 'grpck', 'chroot', 'pivot_root'
  ],

  // Package management
  packageManagement: [
    'apt', 'apt-get', 'apt-cache', 'aptitude', 'dpkg', 'dpkg-deb', 'dpkg-query',
    'update-alternatives', 'snap', 'flatpak', 'yum', 'dnf', 'rpm', 'zypper', 'pacman',
    'emerge', 'portage', 'pkg', 'brew', 'npm', 'yarn', 'pip', 'pip3', 'gem', 'cargo',
    'composer', 'maven', 'gradle', 'make', 'cmake', 'autoconf', 'automake', 'gcc', 'g++',
    'clang', 'ld', 'ar', 'nm', 'objdump', 'readelf', 'ldd', 'ltrace', 'strace'
  ],

  // Archive and compression
  archiveCompression: [
    'tar', 'cpio', 'pax', 'ar', 'zip', 'unzip', 'gzip', 'gunzip', 'zcat', 'zless', 'zmore',
    'zgrep', 'zdiff', 'bzip2', 'bunzip2', 'bzcat', 'bzless', 'bzmore', 'bzgrep', 'bzdiff',
    'xz', 'unxz', 'xzcat', 'xzless', 'xzmore', 'xzgrep', 'xzdiff', 'lzma', 'unlzma',
    'lzcat', 'lzless', 'lzmore', 'lzgrep', 'lzdiff', '7z', '7za', 'rar', 'unrar',
    'compress', 'uncompress', 'zstd', 'unzstd'
  ],

  // Development tools
  development: [
    'git', 'svn', 'cvs', 'hg', 'bzr', 'fossil', 'gh', 'hub', 'tig', 'gitk', 'git-gui',
    'docker', 'docker-compose', 'podman', 'buildah', 'kubectl', 'helm', 'vagrant',
    'terraform', 'ansible', 'puppet', 'chef', 'salt', 'make', 'ninja', 'bazel', 'scons',
    'autoconf', 'automake', 'libtool', 'pkg-config', 'valgrind', 'gprof', 'perf',
    'python', 'python3', 'ruby', 'node', 'npm', 'yarn', 'go', 'rust', 'cargo', 'java',
    'javac', 'mvn', 'gradle', 'ant', 'scala', 'sbt', 'kotlin', 'groovy', 'clojure',
    'lein', 'stack', 'cabal', 'ghc', 'erlang', 'elixir', 'mix', 'rebar3'
  ],

  // Database tools
  databases: [
    'mysql', 'mysqldump', 'mysqladmin', 'psql', 'pg_dump', 'pg_restore', 'createdb',
    'dropdb', 'createuser', 'dropuser', 'mongo', 'mongodump', 'mongorestore', 'redis-cli',
    'redis-server', 'sqlite3', 'influx', 'cqlsh', 'neo4j', 'cypher-shell'
  ],

  // Monitoring and performance
  monitoring: [
    'top', 'htop', 'atop', 'nmon', 'glances', 'dstat', 'iostat', 'mpstat', 'pidstat',
    'vmstat', 'netstat', 'ss', 'iftop', 'nethogs', 'bmon', 'nload', 'iptraf', 'tcptrack',
    'vnstat', 'sar', 'free', 'uptime', 'w', 'who', 'ps', 'pstree', 'lsof', 'fuser',
    'systemd-analyze', 'perf', 'strace', 'ltrace', 'sysdig', 'falco'
  ],

  // Security tools
  security: [
    'gpg', 'gpg2', 'ssh-keygen', 'ssh-add', 'ssh-agent', 'openssl', 'certtool',
    'keytool', 'certbot', 'fail2ban-client', 'ufw', 'iptables', 'nftables', 'selinux',
    'apparmor', 'aide', 'tripwire', 'chkrootkit', 'rkhunter', 'lynis', 'oscap',
    'auditd', 'auditctl', 'ausearch', 'aureport', 'setfacl', 'getfacl', 'umask'
  ],

  // Shell and terminal
  shellTerminal: [
    'bash', 'sh', 'dash', 'zsh', 'fish', 'ksh', 'tcsh', 'csh', 'screen', 'tmux',
    'byobu', 'terminal', 'konsole', 'gnome-terminal', 'xterm', 'rxvt', 'alacritty',
    'terminator', 'tilix', 'tty', 'stty', 'reset', 'clear', 'script', 'scriptreplay',
    'ttyrec', 'ttyplay', 'asciinema', 'expect', 'dialog', 'whiptail', 'zenity'
  ]
}

interface ParseStats {
  total: number
  successful: number
  failed: number
  skipped: number
  duration: number
  bySection: Record<number, number>
  byCategory: Record<string, number>
}

async function getAllCommands(): Promise<string[]> {
  const allCommands = new Set<string>()
  
  // Add all predefined commands
  for (const category of Object.values(LINUX_COMMANDS)) {
    category.forEach(cmd => allCommands.add(cmd))
  }
  
  // Try to get additional commands from the system
  try {
    // Get all available man pages from sections 1-8
    for (let section = 1; section <= 8; section++) {
      const { stdout } = await execAsync(
        `man -k . -s ${section} 2>/dev/null | cut -d' ' -f1 | sort -u`
      )
      stdout.split('\n').filter(Boolean).forEach(cmd => allCommands.add(cmd))
    }
  } catch (error) {
    console.warn('Could not get additional system commands:', error)
  }
  
  return Array.from(allCommands).sort()
}

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(path.join(DATA_DIR, 'json'), { recursive: true })
}

async function parseCommand(command: string): Promise<EnhancedManPage | null> {
  try {
    const startTime = performance.now()
    
    const page = await EnhancedManPageParser.parseFromSystem(command)
    
    if (page) {
      const duration = performance.now() - startTime
      console.log(`✅ ${command} (${page.section}) - ${page.complexity} - ${duration.toFixed(0)}ms`)
      return page
    } else {
      console.warn(`⚠️  ${command} - not found`)
      return null
    }
  } catch (error) {
    console.error(`❌ ${command} - error: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function savePage(page: EnhancedManPage) {
  const fileName = `${page.name}.${page.section}.json`
  const filePath = path.join(DATA_DIR, 'json', fileName)
  
  await fs.writeFile(filePath, JSON.stringify(page, null, 2))
}

async function generateIndexes(pages: EnhancedManPage[]) {
  console.log('\n📚 Generating indexes...')
  
  // Generate main index
  const indexContent = `// Auto-generated index of Linux man pages
// Generated at: ${new Date().toISOString()}
// Total pages: ${pages.length}

import type { EnhancedManPage } from '../../lib/parser/enhanced-man-parser'

export const manPages: Record<string, () => Promise<{ default: EnhancedManPage }>> = {
${pages.map(p => `  '${p.name}.${p.section}': () => import('./json/${p.name}.${p.section}.json')`).join(',\n')}
}

export const availableCommands = [
${pages.map(p => `  '${p.name}'`).join(',\n')}
]

export const commandsBySection: Record<number, string[]> = {
${Object.entries(
  pages.reduce((acc, p) => {
    if (!acc[p.section]) acc[p.section] = []
    acc[p.section].push(p.name)
    return acc
  }, {} as Record<number, string[]>)
).map(([section, commands]) => `  ${section}: [${commands.map(c => `'${c}'`).join(', ')}]`).join(',\n')}
}

export const commandsByCategory: Record<string, string[]> = {
${Object.entries(
  pages.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p.name)
    return acc
  }, {} as Record<string, string[]>)
).map(([category, commands]) => `  '${category}': [${commands.map(c => `'${c}'`).join(', ')}]`).join(',\n')}
}

export async function loadManPage(name: string, section?: number): Promise<EnhancedManPage | null> {
  const key = section ? \`\${name}.\${section}\` : Object.keys(manPages).find(k => k.startsWith(name + '.'))
  
  if (!key || !manPages[key]) {
    return null
  }
  
  try {
    const module = await manPages[key]()
    return module.default
  } catch (error) {
    console.error(\`Failed to load man page \${key}:\`, error)
    return null
  }
}

export const stats = ${JSON.stringify({
  totalPages: pages.length,
  sections: Object.entries(
    pages.reduce((acc, p) => {
      acc[p.section] = (acc[p.section] || 0) + 1
      return acc
    }, {} as Record<number, number>)
  ).sort(([a], [b]) => Number(a) - Number(b)),
  categories: Object.entries(
    pages.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).sort(([, a], [, b]) => b - a),
  complexity: pages.reduce((acc, p) => {
    acc[p.complexity] = (acc[p.complexity] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}, null, 2)}
`

  await fs.writeFile(path.join(DATA_DIR, 'index.ts'), indexContent)
  
  // Generate manifest
  const manifest = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    environment: 'linux',
    distribution: process.env.CI ? 'ubuntu-latest' : 'unknown',
    totalPages: pages.length,
    stats: {
      bySection: pages.reduce((acc, p) => {
        acc[p.section] = (acc[p.section] || 0) + 1
        return acc
      }, {} as Record<number, number>),
      byCategory: pages.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      byComplexity: pages.reduce((acc, p) => {
        acc[p.complexity] = (acc[p.complexity] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      commonCommands: pages.filter(p => p.isCommon).length,
      totalFlags: pages.reduce((sum, p) => sum + p.flags.length, 0),
      totalExamples: pages.reduce((sum, p) => sum + p.examples.length, 0)
    },
    pages: pages.map(p => ({
      name: p.name,
      section: p.section,
      title: p.title,
      category: p.category,
      complexity: p.complexity,
      flagCount: p.flags.length,
      exampleCount: p.examples.length,
      hasInteractiveExamples: p.hasInteractiveExamples,
      size: JSON.stringify(p).length
    })).sort((a, b) => a.name.localeCompare(b.name))
  }
  
  await fs.writeFile(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  
  console.log('✅ Indexes generated')
}

async function main() {
  console.log('🚀 Starting Linux man page parsing in CI...')
  console.log(`🐧 Environment: ${process.env.CI ? 'GitHub Actions (Ubuntu)' : 'Local'}\n`)
  
  const startTime = performance.now()
  const stats: ParseStats = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    bySection: {},
    byCategory: {}
  }
  
  await ensureDirectories()
  
  // Get all commands to parse
  const commands = await getAllCommands()
  console.log(`📋 Found ${commands.length} commands to parse\n`)
  
  stats.total = commands.length
  const pages: EnhancedManPage[] = []
  
  // Parse in batches
  const BATCH_SIZE = 20
  for (let i = 0; i < commands.length; i += BATCH_SIZE) {
    const batch = commands.slice(i, i + BATCH_SIZE)
    const progress = Math.round((i / commands.length) * 100)
    console.log(`\n🔄 Batch ${Math.floor(i / BATCH_SIZE) + 1} - Progress: ${progress}%`)
    
    const batchPromises = batch.map(async (command) => {
      // Check if already parsed
      try {
        const existing = await fs.access(
          path.join(DATA_DIR, 'json', `${command}.*.json`)
        ).then(() => true).catch(() => false)
        
        if (existing) {
          stats.skipped++
          return null
        }
      } catch {}
      
      const page = await parseCommand(command)
      if (page) {
        await savePage(page)
        return page
      }
      return null
    })
    
    const batchResults = await Promise.all(batchPromises)
    
    for (const page of batchResults) {
      if (page) {
        pages.push(page)
        stats.successful++
        stats.bySection[page.section] = (stats.bySection[page.section] || 0) + 1
        stats.byCategory[page.category] = (stats.byCategory[page.category] || 0) + 1
      } else if (page === null) {
        stats.failed++
      }
    }
    
    // Small delay between batches to avoid overwhelming the system
    if (i + BATCH_SIZE < commands.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  stats.duration = performance.now() - startTime
  
  // Generate indexes
  await generateIndexes(pages)
  
  // Print final statistics
  console.log('\n' + '='.repeat(60))
  console.log('✨ Linux man page parsing complete!')
  console.log('='.repeat(60))
  console.log(`📊 Total commands attempted: ${stats.total}`)
  console.log(`✅ Successfully parsed: ${stats.successful}`)
  console.log(`⏭️  Skipped (already exists): ${stats.skipped}`)
  console.log(`❌ Failed: ${stats.failed}`)
  console.log(`⏱️  Total time: ${(stats.duration / 1000).toFixed(2)}s`)
  console.log(`⚡ Average time per command: ${(stats.duration / stats.successful).toFixed(0)}ms`)
  
  console.log('\n📑 Section breakdown:')
  Object.entries(stats.bySection)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([section, count]) => {
      console.log(`   Section ${section}: ${count} pages`)
    })
  
  console.log('\n📁 Category breakdown:')
  Object.entries(stats.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count} pages`)
    })
  
  console.log(`\n📁 Output directory: ${DATA_DIR}`)
  
  // Exit with appropriate code
  process.exit(stats.failed > stats.successful * 0.1 ? 1 : 0)
}

// Run the parser
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})