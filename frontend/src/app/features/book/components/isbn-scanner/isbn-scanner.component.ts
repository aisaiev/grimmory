import {
  Component,
  ElementRef,
  inject,
  linkedSignal,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {BarcodeDetector} from 'barcode-detector/ponyfill';
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
export class IsbnScannerComponent implements OnInit, OnDestroy {
  private messageService = inject(MessageService);
  private transloco = inject(TranslocoService);

  private videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('videoElement');

  private detector: BarcodeDetector | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isDetecting = false;
  private scanSuccessTimeoutId: ReturnType<typeof setTimeout> | undefined;

  readonly isScanning = signal(false);
  readonly cameraPermissionApproved = signal(false);
  readonly scanSuccess = signal(false);
  readonly cameras = signal<MediaDeviceInfo[]>([]);
  readonly selectedCameraId = linkedSignal(() => {
    return this.cameras().length
      ? (this.cameras().find(c => c.label.toLowerCase().includes('back')) ?? this.cameras()[0]).deviceId
      : null;
  });

  isbnScanned = output<string>();

  ngOnInit(): void {
    this.initializeScanner().catch(error => console.error('Scanner initialization failed:', error));
  }

  ngOnDestroy(): void {
    this.cleanupScanner();
  }

  async requestCameraPermission(): Promise<void> {
    try {
      // Trigger the browser permission dialog, then immediately release the stream.
      const probeStream = await navigator.mediaDevices.getUserMedia({video: true});
      probeStream.getTracks().forEach(t => t.stop());
      await this.loadCameras();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const detail = name === 'NotFoundError'
        ? this.transloco.translate('book.isbnScanner.noCamerasFound')
        : this.transloco.translate('book.isbnScanner.cameraPermissionDenied');
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail,
      });
      console.error('Failed to load cameras:', error);
    }
  }

  async startScanning(): Promise<void> {
    if (!this.detector || this.isScanning() || !this.selectedCameraId()) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {deviceId: {exact: this.selectedCameraId()!}},
      });

      const video = this.videoElement().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.isScanning.set(true);
      this.startScanLoop();
    } catch (error) {
      this.releaseStream();
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('common.error'),
        detail: this.transloco.translate('book.isbnScanner.scanError'),
      });
      console.error('Failed to start scanner:', error);
    }
  }

  stopScanning(): void {
    if (!this.isScanning()) return;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.releaseStream();
    this.isScanning.set(false);
    this.isDetecting = false;
  }

  private async initializeScanner(): Promise<void> {
    this.isScanning.set(false);
    this.cameraPermissionApproved.set(false);
    this.detector = new BarcodeDetector({formats: ['isbn', 'ean_13']});

    try {
      const status = await navigator.permissions.query({name: 'camera'});
      if (status.state === 'granted') {
        await this.loadCameras();
      }
    } catch (error) {
      console.error('Failed to query camera permission:', error);
    }
  }

  private async loadCameras(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    this.cameras.set(videoDevices);
    this.cameraPermissionApproved.set(true);

    if (!this.cameras().length) {
      this.messageService.add({
        severity: 'warn',
        summary: this.transloco.translate('common.warning'),
        detail: this.transloco.translate('book.isbnScanner.noCamerasFound'),
      });
    }
  }

  private startScanLoop(): void {
    const loop = async (): Promise<void> => {
      if (!this.isScanning()) return;
      this.animationFrameId = requestAnimationFrame(loop);
      if (this.isDetecting || !this.detector) return;
      const video = this.videoElement().nativeElement;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      this.isDetecting = true;
      try {
        const barcodes = await this.detector.detect(video);
        if (barcodes.length) {
          this.onScanSuccess(barcodes[0].rawValue);
        }
      } finally {
        this.isDetecting = false;
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.videoElement().nativeElement.srcObject = null;
  }

  private cleanupScanner(): void {
    this.stopScanning();
    clearTimeout(this.scanSuccessTimeoutId);
    this.scanSuccessTimeoutId = undefined;
    this.detector = null;
    this.cameraPermissionApproved.set(false);
    this.cameras.set([]);
  }

  private onScanSuccess(decodedText: string): void {
    const normalized = decodedText.trim();
    this.isbnScanned.emit(normalized);

    this.scanSuccess.set(true);
    clearTimeout(this.scanSuccessTimeoutId);
    this.scanSuccessTimeoutId = setTimeout(() => {
      this.scanSuccess.set(false);
      this.scanSuccessTimeoutId = undefined;
    }, 500);
  }
}
