import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { McpTool, McpToolFamily } from "@sezzlee/sdk-nestjs";
import { JwtGuard } from "./auth.js";
import { dynamicMethods, dynamicMethodsSource } from "./dynamic-methods.js";

/**
 * One route dispatching on a method id, published as one tool per method. The response echoes the
 * key the route received and the method it resolved to, which is the direct evidence that the
 * constant the composer wrote is the one the dispatcher read.
 */
@Controller("Rest")
export class DynamicMethodsController {
  @Post("InvokeDynamicMethod/:methodId")
  @HttpCode(200)
  @McpTool({ description: "Invokes a server method by its id." })
  @McpToolFamily({ parameter: "methodId", source: dynamicMethodsSource })
  @UseGuards(JwtGuard)
  invoke(
    @Param("methodId") methodId: string,
    @Body() body: Record<string, unknown>,
  ): unknown {
    const method = dynamicMethods.find(
      (candidate) => candidate.key === methodId.toLowerCase(),
    );
    if (method === undefined) {
      throw new NotFoundException();
    }
    return { methodId, method: method.name, received: body };
  }
}
