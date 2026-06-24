import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateForumCommentDto } from './dto/create-forum-comment.dto';
import { CreateForumPostDto } from './dto/create-forum-post.dto';
import {
  ForumCommentIdParamDto,
  ForumPostIdParamDto,
} from './dto/forum-id-param.dto';
import {
  ForumPostDataResponseDto,
  PaginatedForumCommentResponseDto,
  PaginatedForumPostResponseDto,
} from './dto/forum-response.dto';
import { ListForumCommentsQueryDto } from './dto/list-forum-comments-query.dto';
import { ListForumPostsQueryDto } from './dto/list-forum-posts-query.dto';
import { UpdateForumCommentDto } from './dto/update-forum-comment.dto';
import { UpdateForumPostDto } from './dto/update-forum-post.dto';
import { ForumService } from './forum.service';

@ApiTags('forum')
@ApiBearerAuth()
@Roles(UserRole.PATIENT, UserRole.SUPPORTER)
@Controller('forum')
export class ForumController {
  constructor(private readonly service: ForumService) {}

  @Get('posts')
  @ApiOperation({ summary: 'Daftar post forum' })
  @ApiOkResponse({ type: PaginatedForumPostResponseDto })
  async listPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListForumPostsQueryDto,
  ): Promise<PaginatedForumPostResponseDto> {
    const { posts, total } = await this.service.listPosts(user.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      data: posts,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat post forum' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async createPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateForumPostDto,
  ): Promise<MessageResponseDto> {
    await this.service.createPost(user.id, dto);
    return { message: 'Post forum berhasil dibuat.' };
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Daftar komentar post forum' })
  @ApiOkResponse({ type: PaginatedForumCommentResponseDto })
  async listComments(
    @Param() params: ForumPostIdParamDto,
    @Query() query: ListForumCommentsQueryDto,
  ): Promise<PaginatedForumCommentResponseDto> {
    const { comments, total } = await this.service.listComments(
      params.id,
      query,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      data: comments,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Post('posts/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat komentar atau reply forum' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
    @Body() dto: CreateForumCommentDto,
  ): Promise<MessageResponseDto> {
    await this.service.createComment(user.id, params.id, dto);
    return { message: 'Komentar forum berhasil dibuat.' };
  }

  @Post('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like post forum' })
  @ApiOkResponse({ type: MessageResponseDto })
  async likePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.likePost(user.id, params.id);
    return { message: 'Post forum berhasil disukai.' };
  }

  @Delete('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batalkan like post forum' })
  @ApiOkResponse({ type: MessageResponseDto })
  async unlikePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.unlikePost(user.id, params.id);
    return { message: 'Like post forum berhasil dibatalkan.' };
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Detail post forum' })
  @ApiOkResponse({ type: ForumPostDataResponseDto })
  async findPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
  ): Promise<ForumPostDataResponseDto> {
    const data = await this.service.findPost(user.id, params.id);
    return { data };
  }

  @Patch('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perbarui post forum milik sendiri' })
  @ApiOkResponse({ type: MessageResponseDto })
  async updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
    @Body() dto: UpdateForumPostDto,
  ): Promise<MessageResponseDto> {
    await this.service.updatePost(user.id, params.id, dto);
    return { message: 'Post forum berhasil diperbarui.' };
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hapus post forum milik sendiri' })
  @ApiOkResponse({ type: MessageResponseDto })
  async deletePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumPostIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.deletePost(user.id, params.id);
    return { message: 'Post forum berhasil dihapus.' };
  }

  @Patch('comments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perbarui komentar forum milik sendiri' })
  @ApiOkResponse({ type: MessageResponseDto })
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumCommentIdParamDto,
    @Body() dto: UpdateForumCommentDto,
  ): Promise<MessageResponseDto> {
    await this.service.updateComment(user.id, params.id, dto);
    return { message: 'Komentar forum berhasil diperbarui.' };
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hapus komentar forum milik sendiri' })
  @ApiOkResponse({ type: MessageResponseDto })
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ForumCommentIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.service.deleteComment(user.id, params.id);
    return { message: 'Komentar forum berhasil dihapus.' };
  }
}
