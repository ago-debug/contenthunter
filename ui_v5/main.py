from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# CONFIGURAZIONE
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"

# STILI TEMA (Bitrix24 Inspired)
def setup_styles():
    ui.colors(primary='#212121', secondary='#757575', accent='#E0E0E0', dark='#1D1D1D')
    ui.query('body').style('background-color: #F4F7F9; color: #333333; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 10px !important; margin: 1px 0; transition: all 0.2s; font-weight: 600 !important; }
            .sidebar-item:hover { background-color: rgba(0,0,0,0.03) !important; color: #000 !important; }
            .sidebar-item.active { background-color: white !important; color: #000 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 20px 12px 8px 12px; }
            .main-card { border-radius: 20px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.03); }
            .badge-red { background: #FF5752; color: white; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 900; }
        </style>
    ''')

def sidebar_item(label: str, icon: str, badge: str = None, active: bool = False):
    with ui.button(on_click=lambda: ui.notify(f'Apertura: {label}')).classes(f'w-full justify-start py-2 px-3 sidebar-item {"active" if active else "text-slate-500"}').props('flat no-caps'):
        with ui.row().classes('items-center gap-3 w-full'):
            ui.icon(icon).classes('text-lg opacity-70')
            ui.label(label).classes('text-[13px] tracking-tight')
            if badge:
                ui.spacer()
                with ui.element('span').classes('badge-red'):
                    ui.label(badge)

@ui.page('/')
async def main_page():
    setup_styles()
    
    # HEADER
    with ui.header().classes('bg-white/80 backdrop-blur-md text-slate-800 border-b border-slate-200 px-8 py-3 flex justify-between items-center z-10'):
        ui.label('Industrial PIM Management').classes('text-[10px] font-black opacity-30 uppercase tracking-[0.2em]')
        with ui.row().classes('items-center gap-4'):
            ui.button(icon='search').props('flat round color=grey-7')
            ui.avatar('AG').classes('text-[10px] bg-slate-900 text-white font-bold')

    # SIDEBAR (Allineata con Sidebar.tsx originale)
    with ui.left_drawer(value=True).classes('p-4 flex flex-col gap-0'):
        # Logo Area
        with ui.row().classes('items-center gap-3 mb-8 px-2'):
            with ui.element('div').classes('w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg'):
                ui.label('CH').classes('text-xs')
            with ui.column().classes('gap-0'):
                ui.label('ContentHunter').classes('text-base font-black tracking-tighter text-slate-900 leading-none')
                ui.label('ENTERPRISE PIM').classes('text-[8px] font-bold text-slate-400 mt-1 tracking-widest uppercase')
            
        # Menu Groups
        with ui.scroll_area().classes('flex-1 pr-2'):
            ui.label('CORE PIM').classes('group-label')
            sidebar_item('Master ERP', 'database', active=True)
            sidebar_item('Import Lab', 'file_download', badge='AI')
            sidebar_item('Catalogues', 'inventory_2')
            
            ui.label('DISTRIBUTION').classes('group-label')
            sidebar_item('Excel Export', 'sim_card_download')
            sidebar_item('Omnichannel', 'public')
            
            ui.label('DATA MANAGEMENT').classes('group-label')
            sidebar_item('Categories', 'layers')
            sidebar_item('Brands', 'branding_watermark')
            sidebar_item('Bullet Points', 'list')
            sidebar_item('Tags', 'sell')
            
            ui.label('SYSTEM & AI').classes('group-label')
            sidebar_item('Settings', 'settings')
            sidebar_item('Control Center', 'admin_panel_settings')

        ui.space()
        
        # AI Hub Card (Simile all'originale)
        with ui.card().classes('bg-slate-50/50 border border-slate-200 p-4 rounded-2xl mb-4 cursor-pointer hover:bg-white transition-all'):
            with ui.row().classes('items-center gap-3'):
                ui.avatar('memory', color='white', text_color='slate-400').classes('rounded-lg shadow-sm border border-slate-100')
                with ui.column().classes('gap-0'):
                    ui.label('AI Hub').classes('text-[11px] font-black text-slate-900')
                    ui.label('GPT-4o Ready').classes('text-[8px] font-bold text-slate-400 uppercase tracking-tighter')

    # MAIN CONTENT
    with ui.column().classes('p-10 w-full gap-8'):
        with ui.row().classes('w-full justify-between items-center'):
            with ui.column().classes('gap-1'):
                ui.label('Master ERP Library').classes('text-2xl font-black text-slate-900 tracking-tight')
                ui.label('Validazione e distribuzione dei prodotti master.').classes('text-slate-400 text-sm font-medium')
            ui.button('EXPORT DATA', icon='download').classes('rounded-xl px-6 py-4 bg-slate-900 text-white font-bold').props('no-caps shadow-lg')

        # Placeholder Grid
        with ui.grid(columns=4).classes('w-full gap-6'):
            for i in range(4):
                with ui.card().classes('main-card p-6 gap-4'):
                    ui.skeleton().classes('h-32 w-full rounded-xl')
                    ui.label('Loading Master Data...').classes('text-xs text-slate-400 font-bold uppercase tracking-widest')

ui.run(title=TITLE, port=3001)
