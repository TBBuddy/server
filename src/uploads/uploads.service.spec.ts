import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/exceptions/app.exception';
import { UploadsService } from './uploads.service';

const mockApiSignRequest = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    utils: {
      api_sign_request: mockApiSignRequest,
    },
  },
}));

describe('UploadsService', () => {
  const config = {
    get: jest.fn(),
  };
  const service = new UploadsService(config as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiSignRequest.mockReturnValue('signed-upload');
    config.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'CLOUDINARY_ENABLED') return defaultValue ?? false;
      return undefined;
    });
  });

  it('rejects signature requests when Cloudinary is disabled', () => {
    try {
      service.createImageUploadSignature('user-1');
      throw new Error('Expected createImageUploadSignature to throw.');
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining<Partial<AppException>>({
          statusCode: 503,
          code: 'UPLOAD_PROVIDER_UNAVAILABLE',
        }),
      );
    }
  });

  it('returns a safe upload response when Cloudinary is configured', () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string | boolean> = {
        CLOUDINARY_ENABLED: true,
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      };
      return values[key];
    });

    const response = service.createImageUploadSignature(
      '6853a5edc9e4978ed92bca10',
    );

    expect(response).toEqual(
      expect.objectContaining({
        cloudName: 'demo',
        apiKey: 'key',
        signature: 'signed-upload',
        folder: 'tbuddy/forum',
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        maxFileSizeBytes: 5 * 1024 * 1024,
      }),
    );
    expect(response.publicId).toContain(
      'tbuddy/forum/6853a5edc9e4978ed92bca10/',
    );
    expect(mockApiSignRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'tbuddy/forum',
        public_id: response.publicId,
        timestamp: response.timestamp,
      }),
      'secret',
    );
  });
});
