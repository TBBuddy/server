import { ConfigService } from '@nestjs/config';
import { MongoServerError, ObjectId } from 'mongodb';
import { Database } from 'mongoloquent';
import { UserRole } from '../common/enums/user-role.enum';
import { AppException } from '../common/exceptions/app.exception';
import { IUser } from '../users/user.model';
import { ForumService } from './forum.service';
import { ForumComment } from './models/forum-comment.model';
import { ForumLike } from './models/forum-like.model';
import { IForumPost, ForumPost } from './models/forum-post.model';

describe('ForumService', () => {
  const userId = new ObjectId().toHexString();
  const otherUserId = new ObjectId().toHexString();
  const postId = new ObjectId();
  const parentCommentId = new ObjectId();
  const now = new Date();
  const basePost: IForumPost = {
    _id: postId,
    author_user_id: userId,
    title: 'Forum title',
    content: 'Forum content',
    image_urls: [],
    like_count: 0,
    comment_count: 0,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
  };
  const posts = {
    createIndexes: jest.fn(),
    insertOne: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
  };
  const comments = {
    createIndexes: jest.fn(),
    insertOne: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
  };
  const likes = {
    createIndexes: jest.fn(),
    insertOne: jest.fn(),
    find: jest.fn(),
    deleteOne: jest.fn(),
  };
  const users = {
    find: jest.fn(),
  };
  const modelFor = (collection: unknown) =>
    ({
      query: jest.fn(() => ({
        getMongoDBCollection: jest.fn(() => collection),
      })),
    }) as unknown;
  const service = new ForumService(
    modelFor(posts) as typeof ForumPost,
    modelFor(comments) as typeof ForumComment,
    modelFor(likes) as typeof ForumLike,
    {
      getOrThrow: jest.fn((key: string) =>
        key === 'MONGODB_CONNECTION' ? 'mongodb://test' : 'test',
      ),
    } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Database, 'getDb').mockReturnValue({
      collection: jest.fn(() => users),
    } as never);
    users.find.mockReturnValue({
      project: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: new ObjectId(userId),
            username: 'patient',
            full_name: 'Patient User',
            avatar_url: null,
            role: UserRole.PATIENT,
          } satisfies Partial<IUser>,
        ]),
      })),
    });
    likes.find.mockReturnValue({
      project: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([]),
      })),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a forum post owned by the current user', async () => {
    posts.insertOne.mockResolvedValue({ insertedId: postId });

    await service.createPost(userId, {
      title: 'Forum title',
      content: 'Forum content',
    });

    expect(posts.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        author_user_id: userId,
        title: 'Forum title',
        content: 'Forum content',
        like_count: 0,
        comment_count: 0,
        deleted_at: null,
      }),
    );
  });

  it('rejects post updates by a different user', async () => {
    posts.findOne.mockResolvedValue(basePost);

    await expect(
      service.updatePost(otherUserId, postId.toHexString(), {
        title: 'Updated',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 403,
        code: 'FORBIDDEN',
      }),
    );
    expect(posts.updateOne).not.toHaveBeenCalled();
  });

  it('rejects parent comments from another post', async () => {
    posts.findOne.mockResolvedValue(basePost);
    comments.findOne.mockResolvedValue({
      _id: parentCommentId,
      post_id: new ObjectId().toHexString(),
      deleted_at: null,
    });

    await expect(
      service.createComment(userId, postId.toHexString(), {
        content: 'Reply',
        parentCommentId: parentCommentId.toHexString(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'BUSINESS_RULE_VIOLATION',
      }),
    );
    expect(comments.insertOne).not.toHaveBeenCalled();
  });

  it('does not increment like count for duplicate likes', async () => {
    posts.findOne.mockResolvedValue(basePost);
    likes.insertOne.mockRejectedValue(
      new MongoServerError({ message: 'duplicate key', code: 11000 }),
    );

    await service.likePost(userId, postId.toHexString());

    expect(posts.updateOne).not.toHaveBeenCalled();
  });

  it('does not decrement like count when unlike has no matching like', async () => {
    posts.findOne.mockResolvedValue(basePost);
    likes.deleteOne.mockResolvedValue({ deletedCount: 0 });

    await service.unlikePost(userId, postId.toHexString());

    expect(posts.updateOne).not.toHaveBeenCalled();
  });
});
