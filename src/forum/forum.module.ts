import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ForumComment } from './models/forum-comment.model';
import { ForumLike } from './models/forum-like.model';
import { ForumPost } from './models/forum-post.model';

@Module({
  imports: [
    MongoloquentModule.forFeature([ForumPost, ForumComment, ForumLike]),
  ],
  controllers: [ForumController],
  providers: [ForumService],
})
export class ForumModule {}
