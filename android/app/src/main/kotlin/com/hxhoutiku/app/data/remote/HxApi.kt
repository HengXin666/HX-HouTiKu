package com.hxhoutiku.app.data.remote

import com.hxhoutiku.app.data.remote.dto.*
import retrofit2.http.*

/**
 * Retrofit interface for HX-HouTiKu Worker API.
 */
interface HxApi {

    @GET("/")
    suspend fun healthCheck(): HealthResponse

    @GET("/api/config")
    suspend fun getConfig(): ConfigResponse

    @GET("/api/messages")
    suspend fun getMessages(
        @Header("Authorization") auth: String,
        @Query("since") since: Long? = null,
        @Query("limit") limit: Int? = 50,
        @Query("group") group: String? = null,
        @Query("priority") priority: String? = null
    ): MessagesResponse

    @POST("/api/messages/read")
    suspend fun markAsRead(
        @Header("Authorization") auth: String,
        @Body body: MarkReadRequest
    ): MarkReadResponse

    @POST("/api/recipients")
    suspend fun registerRecipient(
        @Body body: RegisterRecipientRequest
    ): RegisterRecipientResponse

    @GET("/api/recipients")
    suspend fun listRecipients(
        @Header("Authorization") auth: String
    ): List<RecipientDto>

    @DELETE("/api/recipients/{id}")
    suspend fun deleteRecipient(
        @Header("Authorization") auth: String,
        @Path("id") id: String
    )

    @POST("/api/subscribe")
    suspend fun subscribe(
        @Header("Authorization") auth: String,
        @Body body: SubscribeRequest
    ): SubscribeResponse

    @HTTP(method = "DELETE", path = "/api/subscribe", hasBody = true)
    suspend fun unsubscribe(
        @Header("Authorization") auth: String,
        @Body body: SubscribeRequest
    )
}
