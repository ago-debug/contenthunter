from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# CONFIGURAZIONE
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER | DISMANTLER V5.2"

# STILI TEMA (Platinum Grayscale)
dark_theme = {
    'primary': '#FFFFFF',
    'secondary': '#666666',
    'accent': '#1A1A1A',
    'dark': '#080808',
    'positive': '#FFFFFF',
    'negative': '#FF0000',
    'info': '#94A3B8',
    'warning': '#333333'
}

def setup_styles():
    ui.colors(**dark_theme)
    ui.query('body').style('background-color: #080808; color: #F0F0F0; font-family: "Inter", sans-serif;')
    ui.add_head_html('<style>body { overflow-x: hidden; } .q-drawer { background: #000000 !important; border-right: 1px solid #1A1A1A; }</style>')

class PIMApp:
    def __init__(self):
        self.catalogs = []
        self.master_products = []

    async def fetch_catalogs(self):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/repositories")
                if resp.status_code == 200:
                    self.catalogs = resp.json()
                    return self.catalogs
        except:
            return []

app_logic = PIMApp()

@ui.page('/')
async def main_page():
    setup_styles()
    
    # 1. ELEMENTI TOP-LEVEL (Devono essere figli diretti di @ui.page)
    with ui.header().classes('bg-[#080808] border-b border-[#1A1A1A] px-10 py-4 flex justify-between items-center'):
        ui.label('INDUSTRIAL DISMANTLER ENGINE V5.5').classes('text-[9px] font-bold opacity-30 tracking-widest')
        with ui.row().classes('items-center gap-4'):
            ui.badge('SYNC OK').props('outline color=grey-7')
            ui.avatar('AG').classes('text-[10px] bg-[#1A1A1A]')

    with ui.left_drawer(value=True).classes('p-6 flex flex-col'):
        ui.label('CONTENTHUNTER').classes('text-white font-black text-xl tracking-tighter')
        ui.label('DISMANTLER V5.2').classes('text-gray-500 text-xs font-bold -mt-2 mb-10 tracking-widest')
        
        with ui.column().classes('w-full gap-2'):
            ui.button('Dashboard', icon='dashboard').classes('w-full justify-start text-sm').props('flat color=white')
            ui.button('Smontaggio PDF', icon='file_upload').classes('w-full justify-start text-sm text-gray-400').props('flat')
            ui.button('Master Library PIM', icon='database').classes('w-full justify-start text-sm text-gray-400').props('flat')
            ui.button('Asset Matcher', icon='link').classes('w-full justify-start text-sm text-gray-400').props('flat')
            ui.button('Configurazione AI', icon='settings').classes('w-full justify-start text-sm text-gray-400').props('flat')

    # 2. CONTENUTO CENTRALE
    with ui.column().classes('p-10 w-full'):
        ui.label('Dashboard Repository').classes('text-3xl font-bold mb-2')
        ui.label('Collezioni PDF in elaborazione Staging.').classes('text-gray-500 mb-10')
        
        # Griglia Cataloghi
        catalog_grid = ui.grid(columns=4).classes('w-full gap-6')
        catalogs = await app_logic.fetch_catalogs()
        
        if not catalogs:
            with catalog_grid:
                with ui.card().classes('bg-[#101010] border border-[#1A1A1A] p-6'):
                    ui.label('Nessun catalogo trovato.').classes('text-gray-400')
        else:
            for c in catalogs:
                with catalog_grid:
                    with ui.card().classes('bg-[#101010] border border-[#1A1A1A] p-6 hover:border-white transition-all'):
                        ui.label(c['name']).classes('text-base font-bold text-white')
                        ui.label(f"Prodotti: {c.get('product_count', 0)}").classes('text-xs text-gray-500 mb-4')
                        ui.button('GESTISCI', color='white').classes('w-full text-black font-bold h-10').props('rounded=0 truncate')

ui.run(title=TITLE, dark=True, port=3001)
