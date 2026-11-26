import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrivacyPage, TermsPage } from '../pages/LegalPages';
import { renderWithProviders } from './test-utils';

describe('LegalPages — PrivacyPage & TermsPage', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    window.print = vi.fn();
  });

  describe('PrivacyPage', () => {
    it('renders official document title, version 2026.1, and effective date', () => {
      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      // Check document headers and metadata badge
      expect(screen.getByRole('heading', { level: 1, name: /Kebijakan Privasi/i })).toBeInTheDocument();
      expect(screen.getAllByText(/2026\.1/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/20 November 2026/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Laboratorium Jaringan Telekomunikasi/i).length).toBeGreaterThan(0);
    });

    it('renders UU PDP No. 27/2022 legal framework basis and quick highlights', () => {
      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      expect(screen.getAllByText(/Undang-Undang Republik Indonesia Nomor 27 Tahun 2022/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/RINGKASAN CEPAT \(TL;DR\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Nol pelacak iklan/i)).toBeInTheDocument();
      expect(screen.getByText(/Cadangan terenkripsi dengan rotasi 14 hari/i)).toBeInTheDocument();
    });

    it('renders external services and internal registration database, CMS and manual exports accurately', () => {
      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      expect(screen.getByText(/Cloudflare, Inc\./i)).toBeInTheDocument();
      expect(screen.getByText(/Basis Data Pendaftaran & CMS Internal/i)).toBeInTheDocument();
      expect(screen.getByText(/Data pendaftaran disimpan di basis data MongoDB/i)).toHaveTextContent(/panitia berwenang melalui CMS/);
      expect(screen.getByText(/Data pendaftaran disimpan di basis data MongoDB/i)).toHaveTextContent(/ekspor CSV\/XLSX secara manual/);
      expect(screen.queryByText(/Google Workspace|Google Sheets|Apps Script|webhook/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Google Maps Embed/i)).toBeInTheDocument();
      expect(screen.getByText(/Klaster Server Mandiri Laboratorium/i)).toBeInTheDocument();
    });

    it('renders contact desk and data subject rights with SLA of 3x24 hours', () => {
      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      expect(screen.getAllByText(/3×24 Jam/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/telconnetlab@gmail\.com/i).length).toBeGreaterThan(0);
    });

    it('triggers window.print when clicking Cetak / Simpan PDF', () => {
      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      const printBtn = screen.getByRole('button', { name: /Cetak \/ Simpan PDF/i });
      fireEvent.click(printBtn);
      expect(window.print).toHaveBeenCalledTimes(1);
    });

    it('scrolls to section when TOC link is clicked', () => {
      const scrollIntoViewMock = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

      // Mock an element with target id
      const dummySec = document.createElement('div');
      dummySec.id = 'sec-5';
      document.body.appendChild(dummySec);

      renderWithProviders(<PrivacyPage />, { route: '/privacy' });

      const tocButtons = screen.getAllByRole('button');
      const tocButton = tocButtons.find(b => b.textContent?.includes('Pihak Ketiga & Pemroses Data'));
      if (tocButton) {
        fireEvent.click(tocButton);
        expect(scrollIntoViewMock).toHaveBeenCalled();
      }

      document.body.removeChild(dummySec);
    });
  });

  describe('TermsPage', () => {
    it('renders official document title, version 2026.1, and academic scope', () => {
      renderWithProviders(<TermsPage />, { route: '/terms' });

      expect(screen.getByRole('heading', { level: 1, name: /Ketentuan Penggunaan/i })).toBeInTheDocument();
      expect(screen.getAllByText(/2026\.1/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/20 November 2026/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/POIN UTAMA KETENTUAN/i)).toBeInTheDocument();
    });

    it('renders certificate verification rules and intellectual property terms', () => {
      renderWithProviders(<TermsPage />, { route: '/terms' });

      expect(screen.getAllByText(/Keabsahan Portal Verifikasi e-Sertifikat/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Hak Cipta & Lisensi Modul/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Penggunaan yang Diizinkan & Batasan Perilaku \(UU ITE\)/i).length).toBeGreaterThan(0);
    });

    it('triggers window.print when clicking Cetak / Simpan PDF', () => {
      renderWithProviders(<TermsPage />, { route: '/terms' });

      const printBtn = screen.getByRole('button', { name: /Cetak \/ Simpan PDF/i });
      fireEvent.click(printBtn);
      expect(window.print).toHaveBeenCalledTimes(1);
    });
  });
});
