import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MessageService} from 'primeng/api';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {IsbnScannerComponent} from './isbn-scanner.component';

vi.mock('html5-qrcode', () => {
  class Html5Qrcode {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn().mockResolvedValue(undefined);
    static getCameras = vi.fn().mockResolvedValue([]);
  }
  return {Html5Qrcode};
});

describe('IsbnScannerComponent', () => {
  let component: IsbnScannerComponent;
  let fixture: ComponentFixture<IsbnScannerComponent>;
  let messageService: {add: ReturnType<typeof vi.fn>};

  beforeEach(async () => {
    messageService = {add: vi.fn()};

    await TestBed.configureTestingModule({
      imports: [IsbnScannerComponent, getTranslocoModule()],
      providers: [{provide: MessageService, useValue: messageService}],
    }).compileComponents();

    fixture = TestBed.createComponent(IsbnScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with camera ready and not scanning', () => {
    expect(component.isCameraReady).toBe(true);
    expect(component.isScanning).toBe(false);
    expect(component.cameraPermissionRequested).toBe(false);
  });

  it('should show a warning and not set permission flag when no cameras are found', async () => {
    const {Html5Qrcode} = await import('html5-qrcode');
    vi.mocked(Html5Qrcode.getCameras).mockResolvedValueOnce([]);

    await component.requestCameraPermission();

    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({severity: 'warn'}));
    expect(component.cameraPermissionRequested).toBe(false);
  });

  it('should prefer the back camera when multiple cameras are available', async () => {
    const {Html5Qrcode} = await import('html5-qrcode');
    vi.mocked(Html5Qrcode.getCameras).mockResolvedValueOnce([
      {id: 'front-id', label: 'Front Camera'},
      {id: 'back-id', label: 'Back Camera'},
    ]);

    await component.requestCameraPermission();

    expect(component.cameraPermissionRequested).toBe(true);
    expect(component.selectedCameraId).toBe('back-id');
  });

  it('should emit the scanned ISBN when a barcode is successfully decoded', () => {
    const emitted: string[] = [];
    component.isbnScanned.subscribe(isbn => emitted.push(isbn));

    (component as unknown as {onScanSuccess: (text: string) => void}).onScanSuccess('9786177948307');

    expect(emitted).toEqual(['9786177948307']);
  });
});
