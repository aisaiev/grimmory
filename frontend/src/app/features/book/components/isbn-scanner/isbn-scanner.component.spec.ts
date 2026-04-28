import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MessageService} from 'primeng/api';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {IsbnScannerComponent} from './isbn-scanner.component';

vi.mock('barcode-detector/ponyfill', () => {
  class BarcodeDetector {
    detect = vi.fn().mockResolvedValue([]);
  }
  return {BarcodeDetector};
});

const makeFakeStream = (): MediaStream => {
  const track = {stop: vi.fn()} as unknown as MediaStreamTrack;
  return {getTracks: () => [track]} as unknown as MediaStream;
};

describe('IsbnScannerComponent', () => {
  let component: IsbnScannerComponent;
  let fixture: ComponentFixture<IsbnScannerComponent>;
  let messageService: {add: ReturnType<typeof vi.fn>};

  beforeEach(async () => {
    messageService = {add: vi.fn()};

    // Mock mediaDevices
    const fakeStream = makeFakeStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    // Mock Permissions API — default to 'prompt' so tests use the manual button flow
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({state: 'prompt'} as PermissionStatus),
      },
    });

    // Prevent jsdom "not implemented" error for HTMLVideoElement.play
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);

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

  it('should initialize without scanning or permission', () => {
    expect(component.isScanning()).toBe(false);
    expect(component.cameraPermissionApproved()).toBe(false);
  });

  it('should show a warning and still set permission flag when permission granted but no cameras found', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([]);

    await component.requestCameraPermission();

    expect(messageService.add).toHaveBeenCalledWith(expect.objectContaining({severity: 'warn'}));
    expect(component.cameraPermissionApproved()).toBe(true);
  });

  it('should prefer the back camera when multiple cameras are available', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
      {kind: 'videoinput', deviceId: 'front-id', label: 'Front Camera', groupId: '', toJSON: () => ({})},
      {kind: 'videoinput', deviceId: 'back-id', label: 'Back Camera', groupId: '', toJSON: () => ({})},
    ]);

    await component.requestCameraPermission();

    expect(component.cameraPermissionApproved()).toBe(true);
    expect(component.selectedCameraId()).toBe('back-id');
  });

  it('should show noCamerasFound error when getUserMedia throws NotFoundError', async () => {
    const error = Object.assign(new DOMException('Requested device not found', 'NotFoundError'));
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

    await component.requestCameraPermission();

    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({severity: 'error', detail: expect.stringContaining('No cameras found')}),
    );
    expect(component.cameraPermissionApproved()).toBe(false);
  });

  it('should show cameraPermissionDenied error when getUserMedia throws NotAllowedError', async () => {
    const error = Object.assign(new DOMException('Permission denied', 'NotAllowedError'));
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

    await component.requestCameraPermission();

    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({severity: 'error', detail: expect.stringContaining('Camera permission denied')}),
    );
    expect(component.cameraPermissionApproved()).toBe(false);
  });

  it('should release stream and show error when video.play() rejects during startScanning', async () => {
    const fakeStream = makeFakeStream();
    const tracks = fakeStream.getTracks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(fakeStream);
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockRejectedValueOnce(new Error('play failed'));

    // Grant permission first so selectedCameraId is set
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
      {kind: 'videoinput', deviceId: 'cam-1', label: 'Camera', groupId: '', toJSON: () => ({})},
    ]);
    await component.requestCameraPermission();

    await component.startScanning();

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(component.isScanning()).toBe(false);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({severity: 'error', detail: expect.stringContaining('Camera access')}),
    );
  });

  it('should emit the scanned ISBN when a barcode is successfully decoded', () => {
    const emitted: string[] = [];
    component.isbnScanned.subscribe(isbn => emitted.push(isbn));

    (component as unknown as {onScanSuccess: (text: string) => void}).onScanSuccess('9786177948307');

    expect(emitted).toEqual(['9786177948307']);
  });

  it('should set scanSuccess to true on scan and clear it after 500ms', () => {
    vi.useFakeTimers();

    (component as unknown as {onScanSuccess: (text: string) => void}).onScanSuccess('9786177948307');

    expect(component.scanSuccess()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(component.scanSuccess()).toBe(false);

    vi.useRealTimers();
  });

  it('should stop tracks and reset isScanning when stopScanning is called', async () => {
    const fakeStream = makeFakeStream();
    const tracks = fakeStream.getTracks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(fakeStream);
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
      {kind: 'videoinput', deviceId: 'cam-1', label: 'Camera', groupId: '', toJSON: () => ({})},
    ]);
    await component.requestCameraPermission();
    await component.startScanning();

    component.stopScanning();

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(component.isScanning()).toBe(false);
  });

  it('should auto-load cameras on init when permission is already granted', async () => {
    vi.mocked(navigator.permissions.query).mockResolvedValueOnce({state: 'granted'} as PermissionStatus);
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
      {kind: 'videoinput', deviceId: 'cam-1', label: 'Camera', groupId: '', toJSON: () => ({})},
    ]);

    const newFixture = TestBed.createComponent(IsbnScannerComponent);
    newFixture.detectChanges();
    await newFixture.whenStable();
    await new Promise(resolve => setTimeout(resolve)); // flush async initializeScanner() chain

    expect(newFixture.componentInstance.cameraPermissionApproved()).toBe(true);
    expect(newFixture.componentInstance.cameras().length).toBe(1);
  });

  it('should stay on manual button flow when Permissions API throws', async () => {
    vi.mocked(navigator.permissions.query).mockRejectedValueOnce(new Error('Not supported'));

    const newFixture = TestBed.createComponent(IsbnScannerComponent);
    newFixture.detectChanges();
    await newFixture.whenStable();
    await new Promise(resolve => setTimeout(resolve)); // flush async initializeScanner() chain

    expect(newFixture.componentInstance.cameraPermissionApproved()).toBe(false);
  });

  it('should reset selectedCameraId to null when cameras are cleared', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
      {kind: 'videoinput', deviceId: 'cam-1', label: 'Camera', groupId: '', toJSON: () => ({})},
    ]);
    await component.requestCameraPermission();
    expect(component.selectedCameraId()).toBe('cam-1');

    component.cameras.set([]);

    expect(component.selectedCameraId()).toBeNull();
  });
});
