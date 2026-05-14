import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

        let changed = false;

        if (content.includes('NEXTAUTH_URL="http://localhost:3000"')) {
            content = content.replace('NEXTAUTH_URL="http://localhost:3000"', 'NEXTAUTH_URL="https://contenthunter.abreve.it"');
            changed = true;
        } else if (!content.includes('NEXTAUTH_URL')) {
            content += '\nNEXTAUTH_URL="https://contenthunter.abreve.it"\n';
            changed = true;
        } else if (content.includes('NEXTAUTH_URL=') && !content.includes('contenthunter.abreve.it')) {
            content = content.replace(/NEXTAUTH_URL=.*/g, 'NEXTAUTH_URL="https://contenthunter.abreve.it"');
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(envPath, content, 'utf-8');

            // Restart Passenger safely
            const tmpPath = path.resolve(process.cwd(), 'tmp');
            if (!fs.existsSync(tmpPath)) {
                fs.mkdirSync(tmpPath, { recursive: true });
            }
            fs.writeFileSync(path.resolve(tmpPath, 'restart.txt'), new Date().toISOString(), 'utf-8');

            return NextResponse.json({
                success: true,
                message: '✅ File .env aggiornato automaticamente e server Passenger riavviato. Ora il login funzionerà.'
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Il file .env era già configurato correttamente per la produzione.'
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
