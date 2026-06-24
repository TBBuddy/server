import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { AppException } from '../common/exceptions/app.exception';
import { UploadsService } from './uploads.service';

type UploadCallback = (
  error: Error | null,
  result?: { secure_url: string; public_id: string },
) => void;

const mockUploadStream = jest.fn<
  { end: jest.Mock<void, []> },
  [unknown, UploadCallback]
>();

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: mockUploadStream,
    },
  },
}));

describe('UploadsService', () => {
  const config = {
    get: jest.fn(),
  };
  const service = new UploadsService(config as unknown as ConfigService);
  const imageFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    fieldname: 'image',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('image'),
    destination: '',
    filename: '',
    path: '',
    stream: Readable.from([]),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadStream.mockImplementation(
      (_options: unknown, callback: UploadCallback) => ({
        end: jest.fn(() =>
          callback(null, {
            secure_url:
              'https://res.cloudinary.com/demo/image/upload/forum.png',
            public_id: 'tbuddy/forum/forum',
          }),
        ),
      }),
    );
    config.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'CLOUDINARY_ENABLED') return defaultValue ?? false;
      return undefined;
    });
  });

  it('rejects non-image files', async () => {
    await expect(
      service.uploadImage(imageFile({ mimetype: 'application/pdf' })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('rejects files larger than 5 MB', async () => {
    await expect(
      service.uploadImage(imageFile({ size: 5 * 1024 * 1024 + 1 })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('rejects valid images when Cloudinary is disabled', async () => {
    await expect(service.uploadImage(imageFile())).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 503,
        code: 'UPLOAD_PROVIDER_UNAVAILABLE',
      }),
    );
  });

  it('returns a safe upload response when Cloudinary is configured', async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string | boolean> = {
        CLOUDINARY_ENABLED: true,
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      };
      return values[key];
    });

    await expect(service.uploadImage(imageFile())).resolves.toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/forum.png',
      publicId: 'tbuddy/forum/forum',
    });
  });
});
