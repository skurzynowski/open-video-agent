import readline from 'readline';
import { Agent } from './agent';

const agent = new Agent();

interface MenuOption {
  key: string;
  label: string;
  action: () => Promise<void>;
}

const menuOptions: MenuOption[] = [
  {
    key: '1',
    label: 'Uruchom cały proces od nowa',
    action: async () => {
      await agent.processAllVideos();
    },
  },
  {
    key: '2',
    label: 'Tylko ekstrakcja audio z wideo',
    action: async () => {
      await agent.runStep('extract');
    },
  },
  {
    key: '3',
    label: 'Tylko transkrypcja (audio → SRT)',
    action: async () => {
      await agent.runStep('transcribe');
    },
  },
  {
    key: '4',
    label: 'Tylko analiza Claude (SRT → JSON)',
    action: async () => {
      await agent.runStep('analyze');
    },
  },
  {
    key: '5',
    label: 'Tylko organizacja plików + treści platform',
    action: async () => {
      await agent.runStep('organize');
    },
  },
  {
    key: '6',
    label: 'Wybór highlights (fragmenty wideo)',
    action: async () => {
      await agent.runStep('highlights');
    },
  },
  {
    key: '7',
    label: 'Wytnij klipy z highlights',
    action: async () => {
      await agent.runStep('cut-highlights');
    },
  },
  {
    key: '8',
    label: 'Zatwierdź highlights do filmu',
    action: async () => {
      await agent.runStep('approve-highlights');
    },
  },
  {
    key: '9',
    label: 'Połącz film końcowy',
    action: async () => {
      await agent.runStep('assemble-full');
    },
  },
  {
    key: 'u',
    label: 'Wyczyść folder upload',
    action: async () => {
      await agent.clean('upload');
    },
  },
  {
    key: 'o',
    label: 'Wyczyść foldery wyjściowe',
    action: async () => {
      await agent.clean('output');
    },
  },
  {
    key: 'c',
    label: 'Wyczyść wszystko',
    action: async () => {
      await agent.clean('all');
    },
  },
  {
    key: '0',
    label: 'Wyjdź',
    action: async () => {
      console.log('👋 Do zobaczenia!');
      process.exit(0);
    },
  },
];

function printMenu(): void {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           🎬 VIDE-AGENT - Menu główne            ║');
  console.log('╠══════════════════════════════════════════════════╣');

  for (const option of menuOptions) {
    const paddedLabel = option.label.padEnd(44);
    console.log(`║  [${option.key}] ${paddedLabel} ║`);
  }

  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
}

async function promptUser(rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Wybierz opcję: ', (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  agent.setReadlineInterface(rl);

  console.log('🚀 Witaj w VIDE-AGENT!');

  while (true) {
    printMenu();
    const choice = await promptUser(rl);

    const selectedOption = menuOptions.find((opt) => opt.key === choice);

    if (selectedOption) {
      console.log(`\n▶ ${selectedOption.label}\n`);
      try {
        await selectedOption.action();
      } catch (err) {
        console.error(`\n✗ Błąd: ${err instanceof Error ? err.message : err}`);
      }

      if (choice !== '0') {
        console.log('\n✓ Operacja zakończona. Naciśnij Enter, aby kontynuować...');
        await promptUser(rl);
      }
    } else {
      console.log('⚠ Nieprawidłowy wybór. Spróbuj ponownie.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
