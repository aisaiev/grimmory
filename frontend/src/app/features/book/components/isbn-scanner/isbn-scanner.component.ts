import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  output,
} from '@angular/core';
import {Html5Qrcode, CameraDevice} from 'html5-qrcode';
import {Button} from 'primeng/button';
import {Select} from 'primeng/select';
import {MessageService} from 'primeng/api';
import {TranslocoService, TranslocoDirective} from '@jsverse/transloco';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-isbn-scanner',
  standalone: true,
  imports: [Button, Select, FormsModule, TranslocoDirective],
  templateUrl: './isbn-scanner.component.html',
  styleUrl: './isbn-scanner.component.scss',
})
export class IsbnScannerComponent implements AfterViewInit, OnDestroy {
  private messageService = inject(MessageService);
  private transloco = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  readonly containerId = 'isbn-scanner';
  private scanner: Html5Qrcode | null = null;
  isScanning = false;
  isCameraReady = false;
  cameraPermissionRequested = false;
  cameras: CameraDevice[] = [];
  selectedCameraId: string | null = null;

  isbnScanned = output<string>();

  ngAfterViewInit(): void {
    this.initializeScanner();
  }

  ngOnDestroy(): void {
    void this.cleanupScanner();
  }

  private initializeScanner(): void {
    this.isScanning = false;
    this.isCameraReady = false;
    this.cameraPermissionRequested = false;

    this.scanner = new Html5Qrcode(this.containerId);
    this.isCameraReady = true;
    this.cdr.detectChanges();
  }

  async requestCameraPermission(): Promise<void> {
    try {
      this.cameras = await Html5Qrcode.getCameras();
      if (this.cameras.length) {
        const backCamera = this.cameras.find(c => c.label.toLowerCase().includes('back'));
        this.selectedCameraId = backCamera?.id ?? this.cameras[0].id;
        this.cameraPermissionRequested = true;
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: this.transloco.translate('common.warning'),
          detail: this.transloco.translate('book.isbnScanner.noCamerasFound'),
        });
      }
      this.cdr.detectChanges();
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('book.isbnScanner.cameraPermissionDenied'),
      });
      console.error('Failed to load cameras:', error);
    }
  }

  async startScanning(): Promise<void> {
    if (!this.scanner || this.isScanning || !this.selectedCameraId) return;

    try {
      await this.scanner.start(
        this.selectedCameraId,
        {
          fps: 10,
          qrbox: {width: 250, height: 250},
        },
        (decodedText: string) => this.onScanSuccess(decodedText),
        undefined
      );
      this.isScanning = true;
      this.cdr.detectChanges();
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('book.isbnScanner.scanError'),
      });
      this.isScanning = false;
      this.cdr.detectChanges();
      console.error('Failed to start scanner:', error);
    }
  }

  async stopScanning(): Promise<void> {
    if (!this.scanner || !this.isScanning) return;

    try {
      await this.scanner.stop();
      this.isScanning = false;
      this.cdr.detectChanges();
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('book.isbnScanner.scanStopError'),
      });
      console.error('Failed to stop scanner:', error);
    }
  }

  private async cleanupScanner(): Promise<void> {
    if (this.scanner) {
      try {
        if (this.isScanning) {
          await this.scanner.stop();
        }
        this.scanner.clear();
      } catch (error) {
        this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('common.error'),
          detail: this.transloco.translate('book.isbnScanner.scanCleanupError'),
        });
        console.error('Error cleaning up scanner:', error);
      }
      this.scanner = null;
      this.isScanning = false;
      this.isCameraReady = false;
      this.cameraPermissionRequested = false;
      this.cameras = [];
      this.selectedCameraId = null;
    }
    this.cdr.detectChanges();
  }

  private onScanSuccess(decodedText: string): void {
    const normalized = decodedText.trim();
    this.isbnScanned.emit(normalized);
    this.cdr.detectChanges();
  }
}
